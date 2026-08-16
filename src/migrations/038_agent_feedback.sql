-- 038_agent_feedback.sql
-- Avaliação de uma resposta do agente pelo usuário que a recebeu.
--
-- Sem isto o único sinal de qualidade era agent_feature_requests, que captura
-- "não consigo fazer" e nunca "fez, e fez errado" — então troca de modelo
-- degradava em silêncio. Motivo é lista fechada: texto livre não agrega, e o
-- objetivo é poder contar (quantos "incorreto" nesta semana?).
--
-- Uma avaliação por (mensagem, usuário): reavaliar sobrescreve em vez de
-- empilhar. ON DELETE CASCADE nos dois lados — apagar a conversa apaga a
-- avaliação junto, que é o que a retenção de 30 dias já promete.

CREATE TABLE IF NOT EXISTS agent_feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid NOT NULL REFERENCES agent_messages(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating      text NOT NULL CHECK (rating IN ('up', 'down')),
  -- Só faz sentido no 'down'; no 'up' fica null.
  motivo      text CHECK (motivo IN ('incorreto', 'nao_era_o_que_pedi', 'tom', 'lento', 'seguranca', 'outro')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS agent_feedback_created_at_idx ON agent_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS agent_feedback_rating_idx ON agent_feedback(rating, created_at DESC);

DO $$ BEGIN
  CREATE TRIGGER agent_feedback_set_updated_at
    BEFORE UPDATE ON agent_feedback
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
