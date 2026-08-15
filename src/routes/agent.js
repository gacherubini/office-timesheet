// Adaptador site do agente. POST /agent/chat streama a resposta na própria
// conexão (text/event-stream); a proposta de escrita vira um evento no stream.
// O histórico é do servidor (§11): o body traz só message + conversation_id.
import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth.js'
import { loadSession, saveTurn, appendExecutionNote } from '../lib/agent/session.js'
import { extractText, MAX_ATTACHMENT_BYTES } from '../lib/agent/attachments/extract.js'
import { buildUserMessage } from '../lib/agent/attachments/context.js'
import { buildSystemPrompt } from '../lib/agent/prompt.js'
import { esquemaAdmin } from '../lib/agent/schemaContext.js'
import { runAgentTurn } from '../lib/agent/loop.js'
import { getClient } from '../lib/agent/client.js'
import { takeProposal } from '../lib/agent/proposals.js'
import { auditAgentAction, auditAgentCancel } from '../lib/agent/audit.js'
import { logger } from '../lib/logger.js'
import { rateLimit } from '../lib/rateLimit.js'
import proporEncerrarApontamento from '../lib/agent/tools/write/proporEncerrarApontamento.js'
import proporCriarApontamento from '../lib/agent/tools/write/proporCriarApontamento.js'
import proporCriarTask from '../lib/agent/tools/write/proporCriarTask.js'
import proporPedirFerias from '../lib/agent/tools/write/proporPedirFerias.js'

const router = Router()

// Mapa kind → módulo de tool de escrita (para o execute rotear a proposta).
const WRITE_TOOLS = {
  encerrar_apontamento: proporEncerrarApontamento,
  criar_apontamento: proporCriarApontamento,
  criar_task: proporCriarTask,
  pedir_ferias: proporPedirFerias,
}

// §4 kill switch: desliga o agente por env, sem deploy. Default LIGADO — só
// desliga com AGENT_ENABLED explicitamente diferente de 'true'.
function agenteDesligado() {
  return (process.env.AGENT_ENABLED || 'true') !== 'true'
}

// Sem chave o cliente ainda é construído (o SDK v7 exige apiKey no construtor,
// client.js usa um placeholder), e a falha só apareceria como erro de provedor
// no meio do stream. Recusa antes: log alto para quem opera, mensagem genérica
// para quem perguntou — o nome da variável não é assunto do usuário final.
function agenteSemChave() {
  return !process.env.AGENT_API_KEY
}
function recusarSemChave(res) {
  logger.error({ evt: 'agent_misconfig', faltando: 'AGENT_API_KEY' }, 'agente respondendo 503: chave ausente')
  return res.status(503).json({ error: 'Assistente indisponível no momento.' })
}

// §throttle: no máx. N conversas simultâneas por usuário (default 1). Lock em
// memória — mesma instância única do resto do estado do agente (sessão/proposta).
const chatEmVoo = new Map() // user_id → nº de chats /agent/chat ativos agora
function limiteConcorrencia() {
  return Number(process.env.AGENT_MAX_CONCURRENT_PER_USER) || 1
}

// Freio por JANELA, complementar ao lock de concorrência acima: aquele barra a 2ª
// conversa simultânea, este barra a milésima sequencial. Chave por usuário, não
// por IP — o escritório inteiro pode sair pelo mesmo NAT. Construído por
// requisição porque o teto vem de env e o teste precisa apertá-lo em runtime;
// os buckets vivem no módulo rateLimit.js, então nada se perde nisso.
function chatRateLimit(req, res, next) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.AGENT_CHAT_RATE_MAX) || 40,
    key: (r) => `agent-chat:${r.profile?.id ?? r.ip}`,
  })(req, res, next)
}

// Resumo curto do resultado da escrita para a nota de execução (§1): destaca o
// status novo quando existe, sem despejar o payload inteiro no histórico.
function resumoResultado(after) {
  if (after && typeof after === 'object' && after.status) return `Novo status: ${after.status}.`
  return ''
}

// Anexo do chat: memória (lê e descarta), teto de 10 MB. O multer só age em
// multipart; requisição JSON (sem arquivo) passa direto. Erro do multer (ex.:
// arquivo grande demais) vira JSON ANTES de abrir o stream — mensagem clara.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES },
})
function uploadAnexo(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next()
    const grande = err.code === 'LIMIT_FILE_SIZE'
    res.status(grande ? 413 : 400).json({
      error: grande ? 'Arquivo grande demais (máx. 10 MB).' : 'Falha ao ler o arquivo enviado.',
    })
  })
}

router.post('/agent/chat', requireAuth, chatRateLimit, uploadAnexo, async (req, res) => {
  if (agenteDesligado()) return res.status(503).json({ error: 'Assistente temporariamente desativado.' })
  if (agenteSemChave()) return recusarSemChave(res)

  const { message, conversation_id } = req.body || {}
  const temArquivo = !!req.file
  // Com arquivo, a mensagem digitada é opcional; sem arquivo, continua obrigatória.
  if (!temArquivo && (!message || typeof message !== 'string')) {
    return res.status(400).json({ error: 'message é obrigatório.' })
  }

  // Extrai o texto do anexo ANTES de abrir o stream: assim erro de arquivo (tipo
  // não suportado, PDF escaneado, vazio) vira 400 JSON limpo, não um evento de
  // erro num stream já aberto. O buffer é descartado ao fim da requisição.
  let attachment = null
  if (temArquivo) {
    try {
      const { text, meta } = await extractText(req.file.buffer, {
        mimetype: req.file.mimetype,
        filename: req.file.originalname,
      })
      attachment = { filename: req.file.originalname, text, truncated: meta.truncated }
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message })
    }
  }

  // §throttle: barra um 2º /agent/chat simultâneo do MESMO usuário. Adquire o
  // lock antes de abrir o stream; libera no finally (sucesso, erro ou queda).
  const userId = req.profile.id
  const emVoo = chatEmVoo.get(userId) || 0
  if (emVoo >= limiteConcorrencia()) {
    return res.status(429).json({ error: 'Você já tem uma conversa em andamento. Aguarde a resposta antes de enviar outra.' })
  }
  chatEmVoo.set(userId, emVoo + 1)

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  // Evita buffering de proxy (Nginx/Fly): o SSE tem que sair token a token.
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  // §2 desconexão: se o cliente fecha a conexão, sinaliza cancelamento para o
  // laço parar na próxima iteração; o guard evita escrever em socket morto.
  // Escuta em RES, não em REQ: sob body já recebido o 'close' de req dispara
  // cedo (mataria todo turno multi-iteração); o 'close' de res com writableEnded
  // false é o sinal fiel de que o cliente sumiu antes de terminarmos.
  const ac = new AbortController()
  let fechado = false
  res.on('close', () => {
    if (res.writableEnded) return // resposta concluída normalmente — não é desconexão
    fechado = true
    ac.abort()
  })
  const emit = (evento) => {
    if (fechado || res.writableEnded) return
    res.write(`data: ${JSON.stringify(evento)}\n\n`)
  }

  const session = loadSession(conversation_id, req.profile)
  emit({ type: 'session', conversation_id: session.id })

  // Monta o contexto: system (não persistido) + histórico do servidor + a msg nova.
  // Com anexo, o conteúdo do turno traz o bloco do arquivo (dado, não instrução)
  // antes da pergunta; sem anexo, é a própria mensagem.
  // Esquema do banco só para admin (única fatia que vê consultar_dados). Best-
  // effort: se o catálogo não vier (banco lento/fora), o chat segue sem o esquema
  // em vez de dar 500 — degrada, não quebra.
  let esquema = ''
  if (req.profile.role === 'admin') {
    esquema = await esquemaAdmin().catch(() => '')
  }

  const novaMsg = { role: 'user', content: buildUserMessage({ message, attachment }) }
  const messages = [
    { role: 'system', content: buildSystemPrompt(req.profile, new Date(), esquema) },
    ...session.messages,
    novaMsg,
  ]

  try {
    const { status, messages: full } = await runAgentTurn({
      client: getClient(), profile: req.profile, model: process.env.AGENT_MODEL, messages, emit,
      conversationId: session.id, signal: ac.signal,
    })
    // Persiste os turnos novos: tudo depois de system + histórico anterior.
    const novos = full.slice(1 + session.messages.length)
    saveTurn(session.id, req.profile, novos)
    emit({ type: 'done', status })
  } catch (err) {
    emit({ type: 'error', error: err.message })
  } finally {
    const restante = (chatEmVoo.get(userId) || 1) - 1
    if (restante <= 0) chatEmVoo.delete(userId)
    else chatEmVoo.set(userId, restante)
  }
  if (!res.writableEnded) res.end()
})

router.post('/agent/actions/:proposalId/execute', requireAuth, async (req, res) => {
  if (agenteDesligado()) return res.status(503).json({ error: 'Assistente temporariamente desativado.' })
  if (agenteSemChave()) return recusarSemChave(res)

  const proposal = takeProposal(req.params.proposalId, req.profile)
  if (!proposal) return res.status(404).json({ error: 'Proposta não encontrada ou expirada.' })

  const tool = WRITE_TOOLS[proposal.kind]
  if (!tool) return res.status(400).json({ error: 'Tipo de proposta desconhecido.' })

  try {
    const { before, after } = await tool.execute(req.profile, proposal.payload)
    auditAgentAction({ profile: req.profile, tool: proposal.kind, params: proposal.payload, before, after })
    // §1/§10: SÓ AGORA, após a execução real, realimenta a sessão dona com uma
    // nota do que foi feito — para o próximo turno o modelo saber. No-op se a
    // sessão já expirou/sumiu.
    const nota = `✓ Executado: ${proposal.descricao || 'ação confirmada'} ${resumoResultado(after)}`.trim()
    appendExecutionNote(proposal.conversationId, req.profile, nota)
    return res.json({ ok: true, resultado: after })
  } catch (err) {
    return res.status(409).json({ error: err.message })
  }
})

// Simétrico ao execute: consome a proposta (some do Map na hora, não em 5 min) e
// realimenta a sessão dona com uma nota de recusa. Sem esta nota o histórico do
// modelo terminava em 'proposta_emitida' e ele não tinha como saber que a pessoa
// disse não — reoferecia, ou pior, presumia.
router.post('/agent/actions/:proposalId/cancel', requireAuth, async (req, res) => {
  if (agenteDesligado()) return res.status(503).json({ error: 'Assistente temporariamente desativado.' })
  if (agenteSemChave()) return recusarSemChave(res)

  const proposal = takeProposal(req.params.proposalId, req.profile)
  if (!proposal) return res.status(404).json({ error: 'Proposta não encontrada ou expirada.' })

  const nota = `✗ Cancelado pelo usuário: ${proposal.descricao || 'ação proposta'}`
  appendExecutionNote(proposal.conversationId, req.profile, nota)
  auditAgentCancel({ profile: req.profile, tool: proposal.kind, params: proposal.payload })
  return res.json({ ok: true })
})

export default router
