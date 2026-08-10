-- Role SOMENTE-LEITURA para a tool consultar_dados (§8.2 / §16). É a GARANTIA
-- física de que o SQL ad-hoc não escreve — o parser (guard.js) é só defesa em
-- profundidade. Defesa em profundidade também aqui: GRANT SELECT apenas na
-- allowlist, não no schema inteiro. A SENHA não vai nesta migration: é setada
-- fora de banda (secret do Fly + ALTER ROLE); nos testes, um beforeAll faz o
-- ALTER ROLE com senha efêmera (ver tests/helpers/roDb.js).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_readonly') THEN
    CREATE ROLE agent_readonly LOGIN;
  END IF;
END $$;

-- CONNECT no banco atual (o nome varia entre prod e teste → SQL dinâmico).
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO agent_readonly', current_database());
END $$;

-- Ponto de partida limpo: nada, e nem poder criar objeto no schema.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM agent_readonly;
REVOKE CREATE ON SCHEMA public FROM agent_readonly;
GRANT USAGE ON SCHEMA public TO agent_readonly;

-- Só SELECT, só na allowlist (as tabelas descritas em dominio/). Manter em
-- sincronia com TABELAS_PERMITIDAS em src/lib/agent/tools/sql/guard.js.
GRANT SELECT ON
  users, projects, clients, suppliers,
  time_entries, time_entry_pauses,
  tasks, task_comments,
  vacation_requests, expense_requests, bonuses,
  presences, performance_simulations
TO agent_readonly;
