// Laço de tool-calling agnóstico de canal. Recebe o cliente por parâmetro (o
// adaptador injeta o real; os testes, um falso). Streama tokens da resposta,
// executa tools de leitura e PAUSA numa tool de escrita, emitindo a proposta.
import { buildRegistry } from './tools/registry.js'
import { createProposal } from './proposals.js'
import { auditAgentRead, logUsage, logTokenRevoke, logTurnAborted } from './audit.js'
import * as usageRepo from './usageRepo.js'
import { LIMITS, withTimeout } from './guards.js'
import { isAbortError } from './client.js'
import { sugerirProximos } from './suggestions.js'

function lastToolsDesteTurno(messages) {
  let lastUser = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUser = i
      break
    }
  }
  let names = []
  for (let i = lastUser + 1; i < messages.length; i++) {
    const calls = messages[i]?.tool_calls
    if (messages[i]?.role === 'assistant' && Array.isArray(calls) && calls.length) {
      names = calls.map((c) => c.function?.name).filter(Boolean)
    }
  }
  return names
}

function ultimaMensagemUsuarioDe(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'user') continue
    const c = String(messages[i].content || '')
    if (!c.includes('<<<ANEXO>>>')) return c.trim()
    const fim = c.lastIndexOf('<<<FIM ANEXO>>>')
    const visivel = fim >= 0 ? c.slice(fim + '<<<FIM ANEXO>>>'.length) : c
    return visivel.replace(/^\s+/, '').trim()
  }
  return ''
}

function emitirAnswer(emit, text, { profile, messages, context }) {
  emit({ type: 'answer', text })
  const items = sugerirProximos({
    profile,
    context,
    lastTools: lastToolsDesteTurno(messages),
    lastKind: 'answer',
    ultimaMensagemUsuario: ultimaMensagemUsuarioDe(messages),
  })
  if (items.length) emit({ type: 'suggestions', items })
}

function parseArgs(raw) {
  try { return raw ? JSON.parse(raw) : {} } catch { return {} }
}

function pinturaLigada() {
  return (process.env.AGENT_STREAM_PAINT || 'false') === 'true'
}

// Teto de tamanho do resultado de tool que entra no histórico. MAX_TURNS conta
// BLOCOS, nunca tamanho: sem isto, 200 linhas de consultar_dados ficam na sessão
// e são reenviadas a cada turno por dez turnos — custo imprevisível e risco de
// estourar a janela de contexto.
//
// O corte deixa o JSON inválido DE PROPÓSITO. O destinatário é um modelo de
// linguagem, não um parser: o marcador em português diz o que sumiu e o que
// fazer a respeito. Não "conserte" isto fechando o JSON — fechar esconderia o
// corte e o modelo trataria a fatia como resposta completa.
export function truncarResultado(json, limite = Number(process.env.AGENT_MAX_TOOL_RESULT_CHARS) || 20_000) {
  if (json.length <= limite) return json
  return `${json.slice(0, limite)}\n[…resultado cortado: ${json.length} caracteres no total, ${limite} entregues. Diga isso a quem perguntou e ofereça refinar o período ou os filtros para ver o resto.]`
}

// Fallbacks legíveis para os dois becos sem-saída do turno. Ambos deixam o
// histórico limpo (sem push de assistant vazio) — reenviar vazio faria o provedor
// recusar a conversa inteira com 400. `now` é injetável para o teste do orçamento.
const FALLBACK_VAZIO = 'Não entendi essa última mensagem. Era para continuar o que a gente estava fazendo? Confirma em uma frase.'
const FALLBACK_ORCAMENTO = 'Isso está levando mais tempo do que o esperado. Tenta de novo ou refina a pergunta (por exemplo, um período específico).'
// Empurrão de uma volta só, quando o modelo devolve turno vazio. Não entra no
// histórico persistido — só na chamada imediata de retry.
const NUDGE_VAZIO = {
  role: 'system',
  content: 'A última mensagem do usuário pode ter erro de digitação ou estar incompleta. Interprete pelo histórico da conversa e pergunte "Você não quis dizer X?" com o palpite mais provável. Não fique em silêncio e não chame ferramenta até a pessoa confirmar.',
}
// Teto de iterações estourado = o agente tentou e não convergiu. NÃO é erro cru
// pro usuário ("limite de iterações do agente atingido" é jargão interno): vira
// um convite a reformular, com histórico limpo e bem-formado (sem 400 no próximo
// turno). O esclarecimento sob medida ("você quis dizer X?") é papel do modelo,
// nas iterações que ele TEM (ver REGRAS no prompt); isto aqui é só a rede quando
// ele esgota as voltas sem fechar.
const FALLBACK_SEM_RESPOSTA = 'Não consegui chegar a uma resposta pra isso. Pode reformular com outras palavras — por exemplo, dizendo o período, o projeto ou a pessoa que você tem em mente?'

export async function runAgentTurn({ client, profile, model, messages, emit, conversationId = null, signal, now = Date.now, context = null }) {
  const registry = buildRegistry(profile)
  const usageTotal = { tokensIn: 0, tokensOut: 0, cached: 0 }
  const inicio = now()
  let retryVazio = false
  let incluirNudge = false

  for (let i = 0; i < LIMITS.maxIterations; i++) {
    // §2 desconexão: se o cliente sumiu (req.on('close')), para ANTES de gastar
    // outra chamada ao modelo — e nada é emitido para um socket já morto.
    if (signal?.aborted) return { status: 'aborted', messages, usage: usageTotal }

    // §orçamento: estoura o relógio do turno inteiro antes de gastar mais uma
    // chamada ao modelo. Responde o fallback e sai — histórico limpo, sem 400.
    if (now() - inicio > LIMITS.turnBudgetMs) {
      emitirAnswer(emit, FALLBACK_ORCAMENTO, { profile, messages, context })
      return { status: 'done', messages, usage: usageTotal }
    }

    let message, usage
    const paraModelo = incluirNudge ? [...messages, NUDGE_VAZIO] : messages
    incluirNudge = false
    let modo = null // null | 'tools' | 'answer'
    const onDelta = (d) => {
      if (!d || d.reasoning) return
      if (d.toolCall) {
        if (modo === 'answer') {
          emit({ type: 'token_revoke' })
          logTokenRevoke({ profile, conversationId })
        }
        modo = 'tools'
        return
      }
      if (d.content) {
        if (modo === 'tools') return
        if (!modo) modo = 'answer'
        if (modo === 'answer' && pinturaLigada()) emit({ type: 'token', text: d.content })
      }
    }
    try {
      // Classificador de delta (§6.1): reasoning ignora; o primeiro delta útil
      // trava o modo em 'answer' ou 'tools'; content depois de tools é silêncio;
      // toolCall depois de answer emite token_revoke. A pintura (evento `token`)
      // fica atrás de AGENT_STREAM_PAINT — default off — porque o primeiro delta
      // PODE não delatar (raciocínio misturado em content; tool_calls só no fim).
      // `answer` da iteração sem tool_calls continua canônico.
      ;({ message, usage } = await withTimeout(
        client.stream({ messages: paraModelo, tools: registry.definitions, model }, onDelta, { signal }),
        LIMITS.timeoutMs,
      ))
    } catch (err) {
      if (isAbortError(err, signal)) {
        logUsage({ profile, model, status: 'aborted', erro: err?.message })
        await usageRepo.insert({ profile, model, status: 'aborted' })
        logTurnAborted({ profile, conversationId, tinhaResposta: false })
        return { status: 'aborted', messages, usage: usageTotal }
      }
      // §18/§19.1: custo e tentativa precisam aparecer no log inclusive quando a
      // chamada estoura timeout ou erra — não só no caminho feliz. Registra o
      // evento de falha e repropaga (a rota emite o erro ao cliente).
      const status = /timeout/i.test(err?.message || '') ? 'timeout' : 'error'
      logUsage({ profile, model, status, erro: err?.message })
      await usageRepo.insert({ profile, model, status })
      throw err
    }
    const cached = usage?.prompt_tokens_details?.cached_tokens || 0
    usageTotal.tokensIn += usage?.prompt_tokens || 0
    usageTotal.tokensOut += usage?.completion_tokens || 0
    usageTotal.cached += cached
    logUsage({ profile, model, tokensIn: usage?.prompt_tokens || 0, tokensOut: usage?.completion_tokens || 0, cached })
    await usageRepo.insert({ profile, model, tokensIn: usage?.prompt_tokens || 0, tokensOut: usage?.completion_tokens || 0, cached })

    const calls = message.tool_calls || []
    if (calls.length === 0) {
      // Iteração sem tool_calls = resposta final. Só agora o conteúdo é a
      // resposta ao usuário (não raciocínio), então emite-o de uma vez.
      //
      // Guarda contra resposta DEGENERADA: a DeepSeek às vezes devolve um turno
      // vazio (sem content E sem tool_calls — ex.: cortou no meio do raciocínio).
      // Um assistant assim NÃO pode entrar no histórico: reenviá-lo no turno
      // seguinte faz o provedor recusar a conversa INTEIRA com 400 "content or
      // tool_calls must be set". Primeiro tenta de novo com um empurrão; se
      // vier vazio de novo, cai no fallback e deixa o histórico limpo.
      const conteudo = message.content || ''
      if (!conteudo) {
        // Uma segunda chamada no mesmo turno, com o empurrão — o modelo às vezes
        // corta no meio do raciocínio diante de typo. O nudge não entra em
        // `messages`, então a sessão não herda essa muleta.
        if (!retryVazio) {
          retryVazio = true
          incluirNudge = true
          continue
        }
        emitirAnswer(emit, FALLBACK_VAZIO, { profile, messages, context })
        return { status: 'done', messages, usage: usageTotal }
      }
      messages.push(message)
      emitirAnswer(emit, conteudo, { profile, messages, context })
      return { status: 'done', messages, usage: usageTotal }
    }
    messages.push(message)

    for (const call of calls) {
      const tool = registry.get(call.function.name)
      const args = parseArgs(call.function.arguments)
      if (!tool) {
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'ferramenta indisponível' }) })
        continue
      }
      if (tool.kind === 'write') {
        try {
          const { descricao, dados, kind, payload } = await tool.propose(profile, args)
          // Guarda a sessão dona e a descrição na proposta: o execute vai
          // realimentar a sessão com o resultado depois de rodar de fato (§1).
          const { proposalId } = createProposal({ profile, kind, payload, conversationId, descricao })
          emit({ type: 'proposal', proposalId, descricao, dados })
          // Fecha o histórico ANTES de pausar: todo tool_call do assistant precisa
          // de uma resposta role:'tool', senão o próximo turno reenvia ao provedor
          // um histórico malformado (400). A resposta sinaliza PROPOSTA, nunca
          // "feito" (§10). Os demais calls da mesma mensagem também são fechados.
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ status: 'proposta_emitida', descricao }) })
          for (const pendente of calls) {
            if (messages.some((m) => m.role === 'tool' && m.tool_call_id === pendente.id)) continue
            messages.push({ role: 'tool', tool_call_id: pendente.id, content: JSON.stringify({ status: 'nao_executado', motivo: 'aguardando confirmação da proposta anterior' }) })
          }
          return { status: 'awaiting_confirmation', messages, usage: usageTotal }
        } catch (err) {
          // Ex.: "nenhum apontamento aberto" — devolve ao modelo como erro de tool.
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: err.message }) })
        }
      } else if (tool.kind === 'meta') {
        // Captura interna (ex.: registrar_pedido_nao_atendido): roda inline como
        // leitura, mas não é agent_read nem pausa pra proposta.
        try {
          const result = await tool.run(profile, args)
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
        } catch (err) {
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: err.message }) })
        }
      } else {
        try {
          const result = await tool.run(profile, args)
          const arquivos = Array.isArray(result.arquivos) && result.arquivos.length
            ? result.arquivos
            : (result.arquivo ? [result.arquivo] : [])
          for (const arq of arquivos) {
            const { token, filename, mime, bytes } = arq
            emit({ type: 'file', token, filename, mime, bytes })
          }
          const payload = { data: result.data }
          if (result.conectado !== undefined) payload.conectado = result.conectado
          if (result.calendar_error !== undefined) payload.calendar_error = result.calendar_error
          auditAgentRead({ profile, tool: call.function.name, params: args, count: result.count })
          const body = (result.conectado !== undefined || result.calendar_error !== undefined)
            ? payload
            : result.data
          messages.push({ role: 'tool', tool_call_id: call.id, content: truncarResultado(JSON.stringify(body)) })
        } catch (err) {
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: err.message }) })
        }
      }
    }
  }
  // Esgotou as voltas sem uma resposta final: degrada para um convite a
  // reformular em vez de lançar erro cru. Histórico já está bem-formado (cada
  // volta fechou seus tool_calls), então é reenviável sem 400.
  emitirAnswer(emit, FALLBACK_SEM_RESPOSTA, { profile, messages, context })
  return { status: 'done', messages, usage: usageTotal }
}
