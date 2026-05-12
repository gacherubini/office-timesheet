CREATE TABLE vacation_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  days_count  integer NOT NULL,
  reason      text,
  status      text NOT NULL DEFAULT 'pending',
  admin_note  text,
  decided_by  uuid REFERENCES users(id),
  decided_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Bloqueia overlap de férias pending/approved do mesmo usuário
CREATE INDEX vacation_requests_no_user_overlap
  ON vacation_requests
  USING gist (user_id, daterange(start_date, end_date, '[]'))
  WHERE status IN ('pending', 'approved');

CREATE INDEX vacation_requests_status_start_date_idx
  ON vacation_requests(status, start_date);

CREATE INDEX vacation_requests_user_status_idx
  ON vacation_requests(user_id, status);

CREATE TRIGGER vacation_requests_set_updated_at
  BEFORE UPDATE ON vacation_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
