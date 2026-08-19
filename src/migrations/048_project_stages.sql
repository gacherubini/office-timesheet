-- 048_project_stages.sql
-- As etapas DESTA obra. Item 8 do PDF: "Nome, ordem no projeto, prazo de
-- entrega e responsável" + "Status próprio: não iniciada, em andamento,
-- entregue, aprovada pelo cliente".
--
-- POR QUE CÓPIA E NÃO REFERÊNCIA VIVA AO CATÁLOGO: a etapa tem prazo,
-- responsável e status DAQUELA obra. Se `name` fosse um ponteiro para
-- stage_catalog, renomear "Anteprojeto" para "Anteprojeto Executivo"
-- reescreveria o histórico de todas as obras entregues. catalog_id fica
-- guardado só como PROCEDÊNCIA — é o que permite perguntar "quanto custa um
-- anteprojeto, em média" sem amarrar o nome.
--
-- PROGRESSO NÃO É COLUNA. O PDF pede "progresso calculado pelas tarefas
-- concluídas (ex.: 5 de 11)" — calculado. Vem de COUNT(*) FILTER sobre as
-- tarefas da etapa. Coluna denormalizada aqui só criaria oportunidade de
-- divergir do que o quadro mostra.

DO $$ BEGIN
  CREATE TYPE stage_status AS ENUM ('nao_iniciada', 'em_andamento', 'entregue', 'aprovada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS project_stages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  catalog_id uuid REFERENCES stage_catalog(id) ON DELETE SET NULL,
  name       text NOT NULL,
  position   integer NOT NULL DEFAULT 0,
  due_date   date,
  owner_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  status     stage_status NOT NULL DEFAULT 'nao_iniciada',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

CREATE INDEX IF NOT EXISTS project_stages_projeto_idx ON project_stages(project_id, position);
CREATE INDEX IF NOT EXISTS project_stages_owner_idx   ON project_stages(owner_id);

DO $$ BEGIN
  CREATE TRIGGER project_stages_set_updated_at
    BEFORE UPDATE ON project_stages
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
