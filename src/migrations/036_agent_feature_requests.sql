-- 036_agent_feature_requests.sql
-- Pedidos que usuários fizeram ao agente e que nenhuma ferramenta cobria — vira
-- backlog pro programador. Gravado pela tool registrar_pedido_nao_atendido.
-- texto_original é a pergunta crua do usuário (dado sensível; nullable e
-- expurgável — ver LGPD no spec). status: novo|triado|feito|descartado.

CREATE TABLE IF NOT EXISTS agent_feature_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  role           text,
  descricao      text NOT NULL,
  texto_original text,
  status         text NOT NULL DEFAULT 'novo',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_feature_requests_created_at_idx ON agent_feature_requests(created_at);

DO $$ BEGIN
  CREATE TRIGGER agent_feature_requests_set_updated_at
    BEFORE UPDATE ON agent_feature_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
