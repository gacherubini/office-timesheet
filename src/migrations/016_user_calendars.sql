-- 016_user_calendars.sql
-- Vínculo opcional da agenda Google do colaborador via "endereço secreto iCal".
-- A URL é sensível (dá leitura da agenda inteira), então é gravada CIFRADA
-- (AES-256-GCM) — ver src/lib/crypto.js. Um calendário por usuário.

CREATE TABLE user_calendars (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ics_url    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
