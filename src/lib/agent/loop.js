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

export async function runAgentTurn({ client, profile, model, messages, emit }) {
  const registry = buildRegistry(profile)
  const usageTotal = { tokensIn: 0, tokensOut: 0, cached: 0 }

  for (let i = 0; i < LIMITS.maxIterations; i++) {
    const { message, usage } = await withTimeout(
      client.stream({ messages, tools: registry.definitions, model }, (t) => emit({ type: 'token', text: t })),
      LIMITS.timeoutMs,
    )
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
          const { proposalId } = createProposal({ profile, kind, payload })
          emit({ type: 'proposal', proposalId, descricao, dados })
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
