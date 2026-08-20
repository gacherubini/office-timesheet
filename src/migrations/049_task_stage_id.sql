-- 049_task_stage_id.sql
-- "Toda tarefa pertence a uma etapa — campo obrigatório na criação" (item 8 do
-- PDF de ajustes de 18/08/2026).
--
-- stage_id entra NULLABLE aqui. O SET NOT NULL é a migration 051, aplicada só
-- depois de este backfill ser verificado em produção: um ALTER TABLE que falha
-- no meio de um deploy é o pior momento para descobrir uma tarefa órfã.
--
-- ON DELETE RESTRICT: apagar etapa com tarefa dentro tem que falhar. Na tela, a
-- mensagem é "mova as N tarefas antes de excluir".

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES project_stages(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS tasks_stage_idx ON tasks(stage_id);

-- Passo 1: cada projeto ganha as etapas dos task_type das SUAS tarefas.
-- O LEFT JOIN no catálogo herda procedência e ordem quando o nome casa.
INSERT INTO project_stages (project_id, catalog_id, name, position)
SELECT DISTINCT t.project_id, sc.id, btrim(t.task_type), COALESCE(sc.position, 900)
  FROM tasks t
  LEFT JOIN stage_catalog sc ON sc.name = btrim(t.task_type)
 WHERE t.task_type IS NOT NULL AND btrim(t.task_type) <> ''
ON CONFLICT (project_id, name) DO NOTHING;

-- Passo 2: amarra a tarefa à etapa do MESMO projeto.
UPDATE tasks t
   SET stage_id = s.id
  FROM project_stages s
 WHERE s.project_id = t.project_id
   AND s.name = btrim(t.task_type)
   AND t.stage_id IS NULL;

-- Passo 3: o legado sem task_type. É o que permite o NOT NULL da 051 — sem uma
-- etapa coringa, a constraint não subiria com dado real. position 999 mantém
-- "Sem etapa" no fim da trilha, onde ela não atrapalha a leitura do projeto.
INSERT INTO project_stages (project_id, name, position)
SELECT DISTINCT t.project_id, 'Sem etapa', 999
  FROM tasks t
 WHERE t.stage_id IS NULL
ON CONFLICT (project_id, name) DO NOTHING;

UPDATE tasks t
   SET stage_id = s.id
  FROM project_stages s
 WHERE s.project_id = t.project_id
   AND s.name = 'Sem etapa'
   AND t.stage_id IS NULL;
