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
// status: 'ok' no caminho feliz; 'timeout'/'error' quando a chamada falha — o
// evento sai mesmo assim para o custo/tentativa aparecer no log (§18/§19.1).
export function logUsage({ profile, model, tokensIn = 0, tokensOut = 0, cached = 0, status = 'ok', erro }) {
  const priceIn = Number(process.env.AGENT_PRICE_IN) || 0
  const priceOut = Number(process.env.AGENT_PRICE_OUT) || 0
  const priceCached = Number(process.env.AGENT_PRICE_CACHED) || 0
  const naoCacheado = Math.max(0, tokensIn - cached)
  const custo = (naoCacheado * priceIn + cached * priceCached + tokensOut * priceOut) / 1_000_000
  logger.info({
    evt: 'agent_usage', user_id: profile?.id, model,
    tokens_in: tokensIn, tokens_out: tokensOut, tokens_cached: cached, custo,
    status, ...(erro ? { erro } : {}),
  })
}
