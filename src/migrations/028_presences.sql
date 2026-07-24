-- 028_presences.sql
-- Marcar presença: cada colaborador registra, por dia, se vai ao escritório
-- ("coming", com horário de chegada) ou não ("absent"), com motivo opcional.
-- Um registro por (usuário, dia) — o POST faz upsert.

CREATE TABLE IF NOT EXISTS presences (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date         date NOT NULL,
  status       text NOT NULL DEFAULT 'coming',
  arrival_time time,
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS presences_user_date_idx ON presences(user_id, date);
CREATE INDEX IF NOT EXISTS presences_date_idx ON presences(date);

DO $$ BEGIN
  CREATE TRIGGER presences_set_updated_at
    BEFORE UPDATE ON presences
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
