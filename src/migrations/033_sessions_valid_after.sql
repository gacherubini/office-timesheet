-- Invalida JWTs emitidos antes de um reset de senha (token_version temporal).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sessions_valid_after timestamptz NOT NULL DEFAULT 'epoch';
