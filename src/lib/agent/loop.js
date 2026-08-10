// Laço de tool-calling agnóstico de canal. Recebe o cliente por parâmetro (o
// adaptador injeta o real; os testes, um falso). Streama tokens da resposta,
// executa tools de leitura e PAUSA numa tool de escrita, emitindo a proposta.
import { buildRegistry } from './tools/registry.js'
import { createProposal } from './proposals.js'
import { auditAgentRead, logUsage } from './audit.js'
import { LIMITS, withTimeout } from './guards.js'

function parseArgs(raw) {
  try { return raw ? JSON.parse(raw) : {} } catch { return {} }
}

export async function runAgentTurn({ client, profile, model, messages, emit, conversationId = null, signal }) {
  const registry = buildRegistry(profile)
  const usageTotal = { tokensIn: 0, tokensOut: 0, cached: 0 }

  for (let i = 0; i < LIMITS.maxIterations; i++) {
    // §2 desconexão: se o cliente sumiu (req.on('close')), para ANTES de gastar
    // outra chamada ao modelo — e nada é emitido para um socket já morto.
    if (signal?.aborted) return { status: 'aborted', messages, usage: usageTotal }

    let message, usage
    try {
      ;({ message, usage } = await withTimeout(
        client.stream({ messages, tools: registry.definitions, model }, (t) => emit({ type: 'token', text: t })),
        LIMITS.timeoutMs,
      ))
    } catch (err) {
      // §18/§19.1: custo e tentativa precisam aparecer no log inclusive quando a
      // chamada estoura timeout ou erra — não só no caminho feliz. Registra o
      // evento de falha e repropaga (a rota emite o erro ao cliente).
      const status = /timeout/i.test(err?.message || '') ? 'timeout' : 'error'
      logUsage({ profile, model, status, erro: err?.message })
      throw err
    }
    const cached = usage?.prompt_tokens_details?.cached_tokens || 0
    usageTotal.tokensIn += usage?.prompt_tokens || 0
    usageTotal.tokensOut += usage?.completion_tokens || 0
    usageTotal.cached += cached
    logUsage({ profile, model, tokensIn: usage?.prompt_tokens || 0, tokensOut: usage?.completion_tokens || 0, cached })

    messages.push(message)
    const calls = message.tool_calls || []
    if (calls.length === 0) return { status: 'done', messages, usage: usageTotal }

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
      } else {
        try {
          const result = await tool.run(profile, args)
          auditAgentRead({ profile, tool: call.function.name, params: args, count: result.count })
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result.data) })
        } catch (err) {
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: err.message }) })
        }
      }
    }
  }
  throw new Error('limite de iterações do agente atingido')
}
