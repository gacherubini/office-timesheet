-- 029_performance_simulations.sql
-- Simulador de performance: por (usuário, mês 'YYYY-MM'), guarda as horas
-- PLANEJADAS dos dias futuros, em minutos, num mapa jsonb { "YYYY-MM-DD": minutos }.
-- Horas reais nunca entram aqui — vêm sempre vivas de time_entries. Upsert por PK.

CREATE TABLE IF NOT EXISTS performance_simulations (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ym         text NOT NULL,
  planned    jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ym)
);

DO $$ BEGIN
  CREATE TRIGGER performance_simulations_set_updated_at
    BEFORE UPDATE ON performance_simulations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
