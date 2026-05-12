CREATE TABLE time_entries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  started_at        timestamptz NOT NULL,
  ended_at          timestamptz,
  status            time_entry_status NOT NULL DEFAULT 'running',
  duration_minutes  integer,
  cost_snapshot     numeric,
  created_by_admin  boolean NOT NULL DEFAULT false,
  edited_by         uuid REFERENCES users(id),
  edited_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX time_entries_user_id_idx ON time_entries(user_id);
CREATE INDEX time_entries_project_id_idx ON time_entries(project_id);
CREATE INDEX time_entries_status_idx ON time_entries(status);

-- Garante uma única entry aberta por usuário (running ou paused)
CREATE UNIQUE INDEX one_open_entry_per_user
  ON time_entries(user_id)
  WHERE status IN ('running', 'paused');

CREATE TRIGGER time_entries_set_updated_at
  BEFORE UPDATE ON time_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE time_entry_pauses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id uuid NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  paused_at     timestamptz NOT NULL,
  resumed_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX time_entry_pauses_time_entry_id_idx ON time_entry_pauses(time_entry_id);

CREATE TABLE time_entry_change_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id         uuid NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  requested_started_at  timestamptz NOT NULL,
  requested_ended_at    timestamptz NOT NULL,
  reason                text NOT NULL,
  status                text NOT NULL DEFAULT 'pending',
  admin_note            text,
  decided_by            uuid REFERENCES users(id),
  decided_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX time_entry_change_requests_one_pending
  ON time_entry_change_requests(time_entry_id)
  WHERE status = 'pending';

CREATE INDEX time_entry_change_requests_status_idx
  ON time_entry_change_requests(status, created_at DESC);

CREATE INDEX time_entry_change_requests_user_idx
  ON time_entry_change_requests(user_id, created_at DESC);

CREATE TRIGGER time_entry_change_requests_set_updated_at
  BEFORE UPDATE ON time_entry_change_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
