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

// Cancelamento NÃO é agent_action: nada foi escrito. Evento próprio para o Axiom
// conseguir separar "o agente propôs e a pessoa recusou" de "o agente escreveu" —
// a taxa de recusa é o sinal mais direto de proposta mal formulada.
export function auditAgentCancel({ profile, tool, params }) {
  logger.info({ evt: 'agent_cancel', user_id: profile?.id, role: profile?.role, tool, params })
}

// Preços em USD por 1M de tokens (config junto com o modelo). Lidos de env em
// cada chamada — mudam sem redeploy. Fonte única do cálculo de custo, reusada
// pelo logUsage, pelo usageRepo e pela rota de custos.
function precos() {
  return ['AGENT_PRICE_IN', 'AGENT_PRICE_OUT', 'AGENT_PRICE_CACHED']
    .map((n) => Number(process.env[n]))
    .map((v) => (Number.isFinite(v) ? v : 0))
}

export function precosConfigurados() {
  return precos().some((p) => p > 0)
}

// SEM nenhum preço configurado devolve `null`, não `0`: zero é valor de verdade
// e faria toda média mentir para baixo. Com pelo menos um preço, calcula.
export function custoDeUso({ tokensIn = 0, tokensOut = 0, cached = 0 }) {
  if (!precosConfigurados()) return null
  const [priceIn, priceOut, priceCached] = precos()
  const naoCacheado = Math.max(0, tokensIn - cached)
  return (naoCacheado * priceIn + cached * priceCached + tokensOut * priceOut) / 1_000_000
}

// status: 'ok' no caminho feliz; 'timeout'/'error' quando a chamada falha — o
// evento sai mesmo assim para o custo/tentativa aparecer no log (§18/§19.1).
export function logUsage({ profile, model, tokensIn = 0, tokensOut = 0, cached = 0, status = 'ok', erro }) {
  const custo = custoDeUso({ tokensIn, tokensOut, cached })
  logger.info({
    evt: 'agent_usage', user_id: profile?.id, model,
    tokens_in: tokensIn, tokens_out: tokensOut, tokens_cached: cached, custo,
    status, ...(erro ? { erro } : {}),
  })
}
