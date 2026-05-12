CREATE TABLE expense_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  amount        numeric NOT NULL,
  expense_date  date NOT NULL,
  receipt_url   text,
  status        text NOT NULL DEFAULT 'pending',
  admin_note    text,
  decided_by    uuid REFERENCES users(id),
  decided_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX expense_requests_status_idx ON expense_requests(status, created_at DESC);
CREATE INDEX expense_requests_user_idx ON expense_requests(user_id, created_at DESC);
CREATE INDEX expense_requests_date_idx ON expense_requests(expense_date DESC);

CREATE TRIGGER expense_requests_set_updated_at
  BEFORE UPDATE ON expense_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
