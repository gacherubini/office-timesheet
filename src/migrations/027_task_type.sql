-- 027_task_type.sql
-- Etapa/tipo da tarefa (Executivo, Anteprojeto, Compatibilização…).
-- Texto livre com lista sugerida no front; alimenta "Tipos de tarefa" na Performance.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type text;

CREATE INDEX IF NOT EXISTS tasks_task_type_idx ON tasks(task_type);
