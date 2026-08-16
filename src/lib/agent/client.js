// Cliente de LLM agnóstico (OpenAI-compatible, apontando pra API oficial da
// DeepSeek). Streama tokens e devolve a mensagem assistant montada + usage. O
// loop recebe o cliente por parâmetro; getClient/setClient permitem injetar um
// cliente falso nos testes. Provider/model/chave são sobrepostos por env
// (AGENT_PROVIDER_BASE_URL / AGENT_MODEL / AGENT_API_KEY).
import OpenAI from 'openai'
import { withTimeout, LIMITS } from './guards.js'

// deepseek-v4-flash já resolve pro build mais recente (0731) do lado da DeepSeek.
export const DEFAULT_BASE_URL = 'https://api.deepseek.com'
export const DEFAULT_MODEL = 'deepseek-v4-flash'
export const DEFAULT_MAX_RETRIES = 2
export const DEFAULT_RETRY_BACKOFF_MS = 250
// Sem `temperature` no corpo o provedor assume o dele — 1.0 nos dois que já
// usamos, que é temperatura de escrita criativa. Mandamos explícito.
//
// 0.7 é escolha de PRODUTO, não medição — está anotado aqui de propósito para
// ninguém depois ler o número como se fosse resultado de experimento:
//
//   - O que se sabe: a 1.0 a escolha de ferramenta oscilou entre execuções (a
//     mesma pergunta caindo em tools diferentes; num caso o modelo chamou
//     `propor_encerrar_apontamento` para quem pediu para INICIAR um apontamento).
//   - O que NÃO se sabe: se 0.7 tem esse problema. Ninguém mediu 0.7 nem 0.2 —
//     a rodada que mediria isso estava contra um endpoint que devolvia lixo.
//   - Por que 0.7 mesmo assim: o texto é português para pessoa ler, e temperatura
//     baixa engessa a redação. O pior caso do lado da ação é limitado por
//     desenho: toda escrita passa por proposta e confirmação explícita (§16),
//     então proposta errada é chateação, não estrago.
//
// Sinal de que 0.7 foi longe demais: a mesma pergunta escolhendo tools
// diferentes, ou o laço gastando iteração à toa (o §13 avisa que escolha errada
// infla o laço e um modelo barato por token sai caro por pergunta). Se aparecer,
// baixar via AGENT_TEMPERATURE — é env, muda sem deploy. Não descer a 0:
// decodificação gulosa é causa clássica de loop de repetição.
//
// O que temperatura NÃO resolve: a saída degenerada vista em 2026-08-11 (loop de
// repetição, troca de idioma, `</think>` cru no texto) continuou igual a 0.2.
// Aquilo tem outra causa provável — ver o TODO no streamOnce.
export const DEFAULT_TEMPERATURE = 0.7

// Lê número de env respeitando 0 explícito (o `|| default` comum trocaria 0 por
// default, impedindo "desligar o retry" ou "cravar temperatura zero").
function envNum(nome, def) {
  const v = process.env[nome]
  if (v === undefined || v === '') return def
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Abort de usuário/cliente NÃO é transitório — o laço precisa do `name` e não
// deve retentar. signal.aborted cobre cancelamento já consumido pelo SDK.
export function isAbortError(err, signal) {
  if (signal?.aborted) return true
  const name = err?.name || ''
  if (name === 'AbortError' || name === 'APIUserAbortError') return true
  const msg = err?.message || ''
  return /abort/i.test(msg) && !/timeout/i.test(msg)
}

// Transitório = vale retentar: timeout do nosso withTimeout, erro de rede sem
// status, 429 (rate limit) ou 5xx. 4xx de validação (400–428, 430+) NÃO retenta
// — repetir um pedido malformado só queima cota. Abort nunca retenta.
// Sem fallback silencioso (§17).
export function isTransient(err, signal) {
  if (isAbortError(err, signal)) return false
  if (/timeout/i.test(err?.message || '')) return true
  const status = err?.status ?? err?.response?.status ?? err?.statusCode
  if (status === undefined) return true // sem status → erro de rede/desconhecido
  if (status === 429) return true
  return status >= 500
}

const TAG_ABRE = '<think>'
const TAG_FECHA = '</think>'

// Maior sufixo de `texto` que ainda pode virar uma das tags no próximo chunk.
// Segurar esse pedaço é o que faz o filtro sobreviver a `<thi` + `nk>`.
function sufixoParcial(texto) {
  for (let n = Math.min(texto.length, TAG_FECHA.length - 1); n > 0; n--) {
    const cauda = texto.slice(-n)
    if (TAG_ABRE.startsWith(cauda) || TAG_FECHA.startsWith(cauda)) return cauda
  }
  return ''
}

// Filtro de rascunho inlinado no `content` (§ ver comentário em streamOnce).
// `push` devolve { texto, revogar, descartou }: `texto` é o que pode ir pro
// usuário e pro histórico, `revogar` diz que tudo entregue antes era rascunho, e
// `descartou` marca que caractere de rascunho foi jogado fora neste chunk.
export function criarFiltroThinking() {
  let dentro = false      // dentro de um bloco aberto
  let viuAbertura = false // já houve <think> honrado neste stream
  let usouOrfao = false   // o fechamento sem abertura só vale uma vez
  let citouTag = false    // a resposta visível já citou <think> como texto
  let visivel = false     // já saiu conteúdo visível
  let pendente = ''       // cauda segurada entre chunks

  // Fechamento sem abertura: alguns provedores comem a tag de abertura e mandam
  // o rascunho como content comum. Só vale enquanto ninguém abriu um bloco de
  // verdade nem citou a tag no texto — depois disso, `</think>` é só texto.
  const podeOrfao = () => !viuAbertura && !usouOrfao && !citouTag

  function push(entrada) {
    let buf = pendente + entrada
    pendente = ''
    let saida = ''
    let revogar = false
    let descartou = false

    while (buf) {
      if (dentro) {
        const fim = buf.indexOf(TAG_FECHA)
        if (fim === -1) {
          pendente = sufixoParcial(buf)
          if (buf.length > pendente.length) descartou = true
          buf = ''
          break
        }
        descartou = true
        buf = buf.slice(fim + TAG_FECHA.length)
        dentro = false
        continue
      }

      const iAbre = buf.indexOf(TAG_ABRE)
      const iFecha = podeOrfao() ? buf.indexOf(TAG_FECHA) : -1
      if (iAbre === -1 && iFecha === -1) {
        pendente = sufixoParcial(buf)
        saida += buf.slice(0, buf.length - pendente.length)
        buf = ''
        break
      }

      const abrePrimeiro = iAbre !== -1 && (iFecha === -1 || iAbre < iFecha)
      const corte = abrePrimeiro ? iAbre : iFecha
      const prefixo = buf.slice(0, corte)

      if (abrePrimeiro) {
        // Rascunho é o que vem ANTES de qualquer resposta. Um <think> depois de
        // texto visível é o modelo citando a tag, não pensando em voz alta.
        if (!visivel && !prefixo.trim()) {
          dentro = true
          viuAbertura = true
          descartou = true
          buf = buf.slice(corte + TAG_ABRE.length)
          continue
        }
        saida += prefixo + TAG_ABRE
        citouTag = true
        buf = buf.slice(corte + TAG_ABRE.length)
      } else {
        usouOrfao = true
        descartou = true
        revogar = true
        saida = '' // o que saiu antes neste chunk também era rascunho
        buf = buf.slice(corte + TAG_FECHA.length)
      }
      if (saida.trim()) visivel = true
    }

    if (saida.trim()) visivel = true
    return { texto: saida, revogar, descartou }
  }

  // Fim do stream: o que ficou segurado nunca virou tag, então era texto. Bloco
  // aberto e nunca fechado é rascunho inteiro — não vaza.
  function flush() {
    const resto = dentro ? '' : pendente
    pendente = ''
    return resto
  }

  return { push, flush }
}

// Uma tentativa de streaming: dispara o create e acumula deltas de conteúdo e de
// tool_calls, devolvendo a mensagem assistant montada + usage.
// onDelta({ content?, toolCall?: true, reasoning?: true, revoke?: true }) — não mais string.
async function streamOnce(openai, { messages, tools, model }, onDelta, { signal } = {}) {
  const resp = await openai.chat.completions.create({
    model: model || process.env.AGENT_MODEL || DEFAULT_MODEL,
    messages, tools, tool_choice: 'auto',
    temperature: envNum('AGENT_TEMPERATURE', DEFAULT_TEMPERATURE),
    max_tokens: LIMITS.maxTokens,
    stream: true,
    stream_options: { include_usage: true },
    signal,
  })

  let content = ''
  const toolCalls = [] // acumula deltas por índice
  let usage = { prompt_tokens: 0, completion_tokens: 0 }
  let toolCallNotified = false

  // Rascunho do modelo chega de duas formas, e as duas são descartadas aqui:
  //   1. Campo à parte (`reasoning_content`) — o que a API oficial da DeepSeek
  //      faz. Ignorado; só sinalizamos o cano com onDelta({ reasoning: true }).
  //   2. Inlinado no `content` entre <think>…</think> — o que a NVIDIA NIM fez
  //      na eval de 2026-08-11, servindo o Flash como modelo de raciocínio.
  // A forma (2) é a perigosa: sem filtro o rascunho aparece na bolha E entra no
  // histórico como fala do assistente, então na iteração seguinte o modelo relê
  // o próprio rascunho. É a causa provável do loop de repetição e da troca de
  // idioma daquela rodada — seguiu igual a 0.2, logo não era temperatura.
  const filtro = criarFiltroThinking()
  for await (const chunk of resp) {
    if (chunk.usage) usage = chunk.usage
    const delta = chunk.choices?.[0]?.delta
    if (!delta) continue
    if (delta.reasoning_content || delta.reasoning) {
      onDelta({ reasoning: true })
    }
    if (delta.content) {
      const { texto, revogar, descartou } = filtro.push(delta.content)
      if (revogar) {
        content = '' // o que já tinha sido acumulado era rascunho
        onDelta({ revoke: true })
      }
      if (descartou) onDelta({ reasoning: true })
      if (texto) {
        content += texto
        onDelta({ content: texto })
      }
    }
    if (delta.tool_calls?.length) {
      if (!toolCallNotified) {
        toolCallNotified = true
        onDelta({ toolCall: true })
      }
      for (const tc of delta.tool_calls) {
        const slot = (toolCalls[tc.index] ||= { id: tc.id, type: 'function', function: { name: '', arguments: '' } })
        if (tc.id) slot.id = tc.id
        if (tc.function?.name) slot.function.name += tc.function.name
        if (tc.function?.arguments) slot.function.arguments += tc.function.arguments
      }
    }
  }

  const resto = filtro.flush()
  if (resto) {
    content += resto
    onDelta({ content: resto })
  }

  const message = { role: 'assistant', content: content || null }
  if (toolCalls.length) message.tool_calls = toolCalls
  return { message, usage }
}

// Fábrica do cliente real. `openaiOverride` permite injetar um SDK falso nos
// testes de retry. Duas camadas de retry, ambas via AGENT_MAX_RETRIES:
//   - do SDK OpenAI (maxRetries): erros HTTP retentáveis, antes do stream.
//   - nossa (loop abaixo): timeout do withTimeout e o que escapar do SDK, com
//     backoff crescente — sem retentar 4xx de validação nem abort.
export function makeRealClient(openaiOverride) {
  const maxRetries = envNum('AGENT_MAX_RETRIES', DEFAULT_MAX_RETRIES)
  const backoffMs = envNum('AGENT_RETRY_BACKOFF_MS', DEFAULT_RETRY_BACKOFF_MS)
  const attemptTimeoutMs = envNum('AGENT_ATTEMPT_TIMEOUT_MS', LIMITS.timeoutMs)

  // Placeholder de chave para a construção não estourar sem AGENT_API_KEY (o SDK
  // v7 exige apiKey já no construtor). Uma chamada real com chave inválida ainda
  // falha alto — nada de fallback silencioso (§17).
  const openai = openaiOverride || new OpenAI({
    apiKey: process.env.AGENT_API_KEY || 'sk-agente-sem-chave',
    baseURL: process.env.AGENT_PROVIDER_BASE_URL || DEFAULT_BASE_URL,
    maxRetries,
  })

  async function stream(params, onDelta = () => {}, { signal } = {}) {
    let ultimoErro
    for (let tentativa = 0; tentativa <= maxRetries; tentativa++) {
      // Se conteúdo já saiu nesta tentativa, NÃO retenta: reemitir duplicaria a
      // resposta no stream do usuário. toolCall/reasoning não contam como “já pintou”.
      let comecouAEmitir = false
      const onDeltaGuard = (d) => {
        if (d?.content) comecouAEmitir = true
        onDelta(d)
      }
      try {
        return await withTimeout(streamOnce(openai, params, onDeltaGuard, { signal }), attemptTimeoutMs)
      } catch (err) {
        if (isAbortError(err, signal)) throw err
        ultimoErro = err
        const podeRetentar = isTransient(err, signal) && !comecouAEmitir && tentativa < maxRetries
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
