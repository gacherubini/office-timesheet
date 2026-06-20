-- Projeto passa a vincular um cliente cadastrado (FK), além de endereço e data
-- de início. A coluna texto `client` é mantida para projetos antigos (sem
-- vínculo) e como nome denormalizado nos novos, para os leitores existentes.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS client_id  uuid REFERENCES clients(id),
  ADD COLUMN IF NOT EXISTS address    text,
  ADD COLUMN IF NOT EXISTS start_date date;

CREATE INDEX IF NOT EXISTS projects_client_id_idx ON projects(client_id);
