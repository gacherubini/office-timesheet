// Auditoria e observabilidade do agente sobre o logger existente (§12 e §19.1).
// Sem tabela: três campos a mais na linha de log dão consumo por pessoa/dia no
// Axiom, e cada escrita deixa rastro de antes/depois.
import { logger } from '../logger.js'

// Recusa Buffer no payload (não vai pro Axiom) e troca o recibo por metadado.
export function sanitizarParamsAudit(payload = {}, extras = {}) {
  const limpo = {}
  const fonte = payload && typeof payload === 'object' && !Buffer.isBuffer(payload) ? payload : {}
  for (const [k, v] of Object.entries(fonte)) {
    if (Buffer.isBuffer(v)) continue
    limpo[k] = v
  }
  return {
    ...limpo,
    comprovante: !!extras.comprovanteBuffer,
    comprovante_nome: extras.comprovanteNome,
  }
}

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

export function logTokenRevoke({ profile, conversationId }) {
  logger.info({ evt: 'agent_token_revoke', user_id: profile?.id, conversation_id: conversationId })
}

export function logTurnAborted({ profile, conversationId, tinhaResposta }) {
  logger.info({ evt: 'agent_turn_aborted', user_id: profile?.id, conversation_id: conversationId, tinha_resposta: !!tinhaResposta })
}

// Cliente mandou um id de contexto que caiu (malformado / inexistente / deletado).
// Sem o uuid no log: o id inválido não é dado útil e não deve ir pro Axiom.
export function logContextInvalid({ profile, campo }) {
  logger.info({ evt: 'agent_context_invalid', user_id: profile?.id, role: profile?.role, campo })
}

// Só metadado do arquivo gerado — sem buffer, sem conteúdo.
export function logReportGenerated({ profile, formato, fontes, bytes, filename }) {
  logger.info({
    evt: 'agent_report_generated',
    user_id: profile?.id, formato, fontes, bytes, filename,
  })
}
