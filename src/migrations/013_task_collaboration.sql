-- 013_task_collaboration.sql
-- Colaboração em tarefas: comentários, menções, notificações, anexos, etiquetas,
-- prioridade e histórico de atividade.

DO $$ BEGIN
  CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority task_priority NOT NULL DEFAULT 'medium';

-- Comentários
CREATE TABLE task_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_comments_task_idx ON task_comments(task_id, created_at);

-- Menções dentro de comentários
CREATE TABLE task_comment_mentions (
  comment_id  uuid NOT NULL REFERENCES task_comments(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (comment_id, user_id)
);

-- Notificações (destinatário = user_id)
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        text NOT NULL, -- 'mention' | 'task_assigned' | 'task_comment'
  task_id     uuid REFERENCES tasks(id) ON DELETE CASCADE,
  comment_id  uuid REFERENCES task_comments(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_unread_idx ON notifications(user_id, read_at);
CREATE INDEX notifications_user_created_idx ON notifications(user_id, created_at DESC);

-- Anexos
CREATE TABLE task_attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  uploaded_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  file_url     text NOT NULL,
  file_name    text NOT NULL,
  file_size    integer,
  mime_type    text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_attachments_task_idx ON task_attachments(task_id);

-- Etiquetas por tarefa
CREATE TABLE task_labels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  text        text NOT NULL,
  color       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_labels_task_idx ON task_labels(task_id);

-- Histórico de atividade
CREATE TABLE task_activity (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  type        text NOT NULL,
  detail      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_activity_task_idx ON task_activity(task_id, created_at);
