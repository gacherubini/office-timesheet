-- 012_project_management.sql
-- Gerenciamento de projetos: líderes, tarefas, tempo por tarefa.

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6.1 Líderes de projeto (N colaboradores por projeto)
CREATE TABLE project_leaders (
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX project_leaders_user_idx ON project_leaders(user_id);

-- 6.2/6.3 Tarefas (1 responsável, status, prazo)
CREATE TABLE tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text,
  status       task_status NOT NULL DEFAULT 'todo',
  assignee_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  due_date     date,
  position     integer NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES users(id),
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_project_idx ON tasks(project_id);
CREATE INDEX tasks_assignee_idx ON tasks(assignee_id);
CREATE INDEX tasks_status_idx ON tasks(status);

CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 6.6 Sessões de tempo por tarefa (cronômetro: started_at -> ended_at)
CREATE TABLE task_time_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at        timestamptz NOT NULL DEFAULT now(),
  ended_at          timestamptz,
  duration_minutes  integer,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_time_logs_task_idx ON task_time_logs(task_id);
CREATE INDEX task_time_logs_user_idx ON task_time_logs(user_id);

-- No máximo uma sessão aberta por (tarefa, usuário)
CREATE UNIQUE INDEX task_time_logs_one_open_per_user
  ON task_time_logs(task_id, user_id)
  WHERE ended_at IS NULL;
