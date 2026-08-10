// Cliente de LLM agnóstico (OpenAI-compatible via OpenRouter). Streama tokens e
// devolve a mensagem assistant montada + usage. O loop recebe o cliente por
// parâmetro; getClient/setClient permitem injetar um cliente falso nos testes.
import OpenAI from 'openai'
import { withTimeout, LIMITS } from './guards.js'

export const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1'
export const DEFAULT_MODEL = 'deepseek-ai/deepseek-v4-flash-0731'
export const DEFAULT_MAX_RETRIES = 2
export const DEFAULT_RETRY_BACKOFF_MS = 250

// Lê inteiro de env respeitando 0 explícito (o `|| default` comum trocaria 0
// por default, impedindo "desligar o retry").
function envInt(nome, def) {
  const v = process.env[nome]
  if (v === undefined || v === '') return def
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Transitório = vale retentar: timeout do nosso withTimeout, erro de rede sem
// status, 429 (rate limit) ou 5xx. 4xx de validação (400–428, 430+) NÃO retenta
// — repetir um pedido malformado só queima cota. Sem fallback silencioso (§17).
export function isTransient(err) {
  if (/timeout/i.test(err?.message || '')) return true
  const status = err?.status ?? err?.response?.status ?? err?.statusCode
  if (status === undefined) return true // sem status → erro de rede/desconhecido
  if (status === 429) return true
  return status >= 500
}

// Uma tentativa de streaming: dispara o create e acumula deltas de conteúdo e de
// tool_calls, devolvendo a mensagem assistant montada + usage.
async function streamOnce(openai, { messages, tools, model }, onToken) {
  const resp = await openai.chat.completions.create({
    model: model || process.env.AGENT_MODEL || DEFAULT_MODEL,
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

// Fábrica do cliente real. `openaiOverride` permite injetar um SDK falso nos
// testes de retry. Duas camadas de retry, ambas via AGENT_MAX_RETRIES:
//   - do SDK OpenAI (maxRetries): erros HTTP retentáveis, antes do stream.
//   - nossa (loop abaixo): timeout do withTimeout e o que escapar do SDK, com
//     backoff crescente — sem retentar 4xx de validação.
export function makeRealClient(openaiOverride) {
  const maxRetries = envInt('AGENT_MAX_RETRIES', DEFAULT_MAX_RETRIES)
  const backoffMs = envInt('AGENT_RETRY_BACKOFF_MS', DEFAULT_RETRY_BACKOFF_MS)
  const attemptTimeoutMs = envInt('AGENT_ATTEMPT_TIMEOUT_MS', LIMITS.timeoutMs)

  // Placeholder de chave para a construção não estourar sem AGENT_API_KEY (o SDK
  // v7 exige apiKey já no construtor). Uma chamada real com chave inválida ainda
  // falha alto — nada de fallback silencioso (§17).
  const openai = openaiOverride || new OpenAI({
    apiKey: process.env.AGENT_API_KEY || 'sk-agente-sem-chave',
    baseURL: process.env.AGENT_PROVIDER_BASE_URL || DEFAULT_BASE_URL,
    maxRetries,
  })

  async function stream(params, onToken) {
    let ultimoErro
    for (let tentativa = 0; tentativa <= maxRetries; tentativa++) {
      // Se um token já saiu nesta tentativa, NÃO retenta: reemitir duplicaria a
      // resposta no stream do usuário. Falha só é retentável antes do 1º token.
      let comecouAEmitir = false
      const onTokenGuard = (t) => { comecouAEmitir = true; onToken(t) }
      try {
        return await withTimeout(streamOnce(openai, params, onTokenGuard), attemptTimeoutMs)
      } catch (err) {
        ultimoErro = err
        const podeRetentar = isTransient(err) && !comecouAEmitir && tentativa < maxRetries
        if (!podeRetentar) break
        await sleep(backoffMs * 2 ** tentativa) // espera crescente
      }
    }
    // Mensagem final clara — o loop registra usage de falha e a rota emite isto.
    throw new Error(`o modelo não respondeu após ${maxRetries + 1} tentativa(s): ${ultimoErro?.message || 'erro desconhecido'}`)
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
