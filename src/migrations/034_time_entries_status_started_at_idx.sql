-- O dashboard (routes/dashboard.js) filtra time_entries por
--   status = 'completed' AND started_at >= $1 AND started_at < $2.
-- Os índices existentes são separados (status; nenhum em started_at), então o
-- planner varre por status e filtra started_at linha a linha. O índice composto
-- (status, started_at) cobre os dois predicados de uma vez — mesmo padrão dos
-- índices compostos já usados em expense_requests/notifications.
--
-- Sem CONCURRENTLY de propósito: o migrate.js roda cada migration dentro de uma
-- transação (BEGIN/COMMIT) e CREATE INDEX CONCURRENTLY não pode rodar em
-- transação. O lock de escrita durante a criação é curto no volume atual.
CREATE INDEX IF NOT EXISTS time_entries_status_started_at_idx
  ON time_entries (status, started_at);
