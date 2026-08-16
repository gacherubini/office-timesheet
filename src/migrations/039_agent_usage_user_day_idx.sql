-- 039_agent_usage_user_day_idx.sql
-- O teto de gasto diário (lib/agent/orcamento.js) soma custo_usd por usuário no
-- dia corrente, e isso roda ANTES de cada turno do agente. O índice de
-- created_at sozinho não serve: o filtro começa por user_id.

CREATE INDEX IF NOT EXISTS agent_usage_user_created_at_idx
  ON agent_usage (user_id, created_at DESC);
