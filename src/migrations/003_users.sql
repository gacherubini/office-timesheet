CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TABLE users (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                       text NOT NULL UNIQUE,
  password_hash               text NOT NULL,
  name                        text NOT NULL,
  role                        user_role NOT NULL DEFAULT 'employee',
  hourly_rate                 numeric,
  fixed_salary                numeric DEFAULT 0,
  monthly_income_goal         numeric NOT NULL DEFAULT 0,
  position                    text,
  birth_date                  date,
  phone                       text,
  avatar_url                  text,
  is_active                   boolean NOT NULL DEFAULT true,
  password_reset_token        text,
  password_reset_expires_at   timestamptz,
  deleted_at                  timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX users_role_idx ON users(role);
CREATE INDEX users_deleted_at_idx ON users(deleted_at);
CREATE INDEX users_reset_token_idx ON users(password_reset_token)
  WHERE password_reset_token IS NOT NULL;

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
