// Adaptador site do agente. POST /agent/chat streama a resposta na própria
// conexão (text/event-stream); a proposta de escrita vira um evento no stream.
// O histórico é do servidor (§11): o body traz só message + conversation_id.
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { loadSession, saveTurn, appendExecutionNote } from '../lib/agent/session.js'
import { buildSystemPrompt } from '../lib/agent/prompt.js'
import { runAgentTurn } from '../lib/agent/loop.js'
import { getClient } from '../lib/agent/client.js'
import { takeProposal } from '../lib/agent/proposals.js'
import { auditAgentAction } from '../lib/agent/audit.js'
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

// §throttle: no máx. N conversas simultâneas por usuário (default 1). Lock em
// memória — mesma instância única do resto do estado do agente (sessão/proposta).
const chatEmVoo = new Map() // user_id → nº de chats /agent/chat ativos agora
function limiteConcorrencia() {
  return Number(process.env.AGENT_MAX_CONCURRENT_PER_USER) || 1
}

// Resumo curto do resultado da escrita para a nota de execução (§1): destaca o
// status novo quando existe, sem despejar o payload inteiro no histórico.
function resumoResultado(after) {
  if (after && typeof after === 'object' && after.status) return `Novo status: ${after.status}.`
  return ''
}

router.post('/agent/chat', requireAuth, async (req, res) => {
  if (agenteDesligado()) return res.status(503).json({ error: 'Assistente temporariamente desativado.' })

  const { message, conversation_id } = req.body || {}
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message é obrigatório.' })
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
  const novaMsg = { role: 'user', content: message }
  const messages = [
    { role: 'system', content: buildSystemPrompt(req.profile) },
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

export default router
