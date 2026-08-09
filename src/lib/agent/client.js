// Cliente de LLM agnóstico (OpenAI-compatible via OpenRouter). Streama tokens e
// devolve a mensagem assistant montada + usage. O loop recebe o cliente por
// parâmetro; getClient/setClient permitem injetar um cliente falso nos testes.
import OpenAI from 'openai'

function makeRealClient() {
  // Placeholder de chave para a construção não estourar sem AGENT_API_KEY (o
  // SDK v7 exige apiKey já no construtor). Uma chamada real com chave inválida
  // ainda falha alto — nada de fallback silencioso (§17).
  const client = new OpenAI({
    apiKey: process.env.AGENT_API_KEY || 'sk-agente-sem-chave',
    baseURL: process.env.AGENT_PROVIDER_BASE_URL || 'https://openrouter.ai/api/v1',
  })

  async function stream({ messages, tools, model }, onToken) {
    const resp = await client.chat.completions.create({
      model: model || process.env.AGENT_MODEL || 'deepseek/deepseek-v4-pro',
      messages, tools, tool_choice: 'auto',
      max_tokens: Number(process.env.AGENT_MAX_TOKENS) || 1024,
      stream: true,
      stream_options: { include_usage: true },
    })

    let content = ''
    const toolCalls = [] // acumula deltas por índice
    let usage = { prompt_tokens: 0, completion_tokens: 0 }

    for await (const chunk of resp) {
      if (chunk.usage) usage = chunk.usage
      const delta = chunk.choices?.[0]?.delta
      if (!delta) continue
      if (delta.content) { content += delta.content; onToken(delta.content) }
      for (const tc of delta.tool_calls || []) {
        const slot = (toolCalls[tc.index] ||= { id: tc.id, type: 'function', function: { name: '', arguments: '' } })
        if (tc.id) slot.id = tc.id
        if (tc.function?.name) slot.function.name += tc.function.name
        if (tc.function?.arguments) slot.function.arguments += tc.function.arguments
      }
    }

    const message = { role: 'assistant', content: content || null }
    if (toolCalls.length) message.tool_calls = toolCalls
    return { message, usage }
  }

  return { stream }
}

let active = null
export function getClient() {
  if (!active) active = makeRealClient()
  return active
}
export function setClient(fake) { active = fake }
export function resetClient() { active = null }
