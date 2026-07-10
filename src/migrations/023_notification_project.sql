-- Notificações de apontamento de projeto (start/stop) para admins.
-- Uma notificação passa a poder referenciar um projeto, além de tarefa.
-- Novos types ('time_entry_started' | 'time_entry_stopped') não exigem
-- schema extra: a coluna `type` é text livre.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE CASCADE;
