// Auditoria e observabilidade do agente sobre o logger existente (§12 e §19.1).
// Sem tabela: três campos a mais na linha de log dão consumo por pessoa/dia no
// Axiom, e cada escrita deixa rastro de antes/depois.
import { logger } from '../logger.js'

export function auditAgentRead({ profile, tool, params, count }) {
  logger.info({ evt: 'agent_read', user_id: profile?.id, role: profile?.role, tool, params, count })
}

export function auditAgentAction({ profile, tool, params, before, after }) {
  logger.info({ evt: 'agent_action', user_id: profile?.id, role: profile?.role, tool, params, before, after })
}

// Custo = tokens não-cacheados a preço cheio + cacheados a preço de cache.
// Preços em USD por 1M de tokens, configurados junto com o modelo.
// SEM NENHUM preço configurado o custo é `null`, não `0`: zero é um valor de
// verdade e faria toda média no Axiom mentir para baixo, escondendo justamente
// o gasto que o §19.1 quer observar. Com pelo menos um preço, calcula.
// status: 'ok' no caminho feliz; 'timeout'/'error' quando a chamada falha — o
// evento sai mesmo assim para o custo/tentativa aparecer no log (§18/§19.1).
export function logUsage({ profile, model, tokensIn = 0, tokensOut = 0, cached = 0, status = 'ok', erro }) {
  const precos = ['AGENT_PRICE_IN', 'AGENT_PRICE_OUT', 'AGENT_PRICE_CACHED']
    .map((n) => Number(process.env[n]))
    .map((v) => (Number.isFinite(v) ? v : 0))
  const configurado = precos.some((p) => p > 0)
  const [priceIn, priceOut, priceCached] = precos
  const naoCacheado = Math.max(0, tokensIn - cached)
  const custo = configurado
    ? (naoCacheado * priceIn + cached * priceCached + tokensOut * priceOut) / 1_000_000
    : null
  logger.info({
    evt: 'agent_usage', user_id: profile?.id, model,
    tokens_in: tokensIn, tokens_out: tokensOut, tokens_cached: cached, custo,
    status, ...(erro ? { erro } : {}),
  })
}
