-- Liga anexos opcionalmente a um comentário. Quando comment_id é NULL,
-- o anexo é "da tarefa" (ex: anexos jogados junto com a descrição).
ALTER TABLE task_attachments
  ADD COLUMN IF NOT EXISTS comment_id uuid REFERENCES task_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS task_attachments_comment_id_idx
  ON task_attachments(comment_id)
  WHERE comment_id IS NOT NULL;
