-- 037_agent_conversations.sql
-- Conversas persistidas do agente (fatia 3). Hard delete, sem deleted_at.
-- Mensagens são append-only: trigger set_updated_at só em agent_conversations.

CREATE TABLE agent_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            text NOT NULL,
  title           text NOT NULL,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_conversations_user_last_idx
  ON agent_conversations (user_id, last_message_at DESC);

CREATE TABLE agent_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  seq              integer NOT NULL,
  role             text NOT NULL,          -- 'user' | 'assistant' | 'tool'
  content          text,                   -- texto; tool já passa por truncarResultado
  tool_calls       jsonb,                  -- assistant com tools
  tool_call_id     text,                   -- role='tool'
  ui               jsonb,                  -- só user/assistant: { anexo, proposta, arquivos, erro }
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, seq)
);

CREATE INDEX agent_messages_conv_seq_idx
  ON agent_messages (conversation_id, seq);

-- 036_agent_feature_requests.sql já mostra o padrão da casa.
-- Mensagens são append-only: sem trigger.
DO $$ BEGIN
  CREATE TRIGGER agent_conversations_set_updated_at
    BEFORE UPDATE ON agent_conversations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
