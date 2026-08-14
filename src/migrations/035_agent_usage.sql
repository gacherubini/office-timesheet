-- 035_agent_usage.sql
-- Uso do agente persistido, uma linha por chamada de API (§19.1 evoluído). Antes
-- só ia pra linha de log; agora fica salvo pra série de gasto por dia/mês na tela
-- admin. custo_usd é nullable: sem preços configurados, custo é desconhecido (não
-- zero). user_id vira NULL se o usuário for removido — histórico de custo não some.

CREATE TABLE IF NOT EXISTS agent_usage (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  model         text,
  tokens_in     integer NOT NULL DEFAULT 0,
  tokens_out    integer NOT NULL DEFAULT 0,
  tokens_cached integer NOT NULL DEFAULT 0,
  custo_usd     numeric(12, 6),
  status        text NOT NULL DEFAULT 'ok',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_usage_created_at_idx ON agent_usage(created_at);
