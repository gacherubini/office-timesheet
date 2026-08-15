// Guardas por requisição (§9, camada 7). Impedem loop infinito numa requisição
// isolada; o gasto agregado é observado, não bloqueado (§19.1).
export const LIMITS = {
  maxIterations: Number(process.env.AGENT_MAX_ITERATIONS) || 6,
  maxTokens: Number(process.env.AGENT_MAX_TOKENS) || 1024,
  timeoutMs: Number(process.env.AGENT_TIMEOUT_MS) || 30000,
  // Teto de RELÓGIO do turno inteiro. maxIterations limita o nº de voltas, mas sem
  // isto o pior caso é maxIterations × timeoutMs (6 × 30s = 180s) preso no usuário.
  // Ao estourar, o laço para de chamar o modelo e cai num fallback legível. Folgado
  // pra caber 3-4 correções de SQL (~3s cada) + a resposta; env-overridable.
  turnBudgetMs: Number(process.env.AGENT_TURN_BUDGET_MS) || 45000,
}

export function withTimeout(promise, ms) {
  let t
  const timeout = new Promise((_, reject) => { t = setTimeout(() => reject(new Error('timeout')), ms) })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t))
}

// Limites do SQL de leitura restrito (§8.2). maxRows é o teto do LIMIT forçado;
// statementTimeoutMs corta consulta longa no banco. Env-overridable, folgado.
export const SQL_LIMITS = {
  maxRows: Number(process.env.AGENT_SQL_MAX_ROWS) || 200,
  statementTimeoutMs: Number(process.env.AGENT_SQL_TIMEOUT_MS) || 3000,
}
