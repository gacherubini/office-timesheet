CREATE TABLE bonuses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  amount      numeric NOT NULL,
  bonus_date  date NOT NULL,
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bonuses_user_id_idx ON bonuses(user_id);
CREATE INDEX bonuses_bonus_date_idx ON bonuses(bonus_date);

CREATE TRIGGER bonuses_set_updated_at
  BEFORE UPDATE ON bonuses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
