-- Perfil do cliente ganha CPF, data de nascimento e endereço, além de anexos.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS cpf        text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS address    text;

CREATE TABLE IF NOT EXISTS client_attachments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  file_url    text NOT NULL,
  file_name   text NOT NULL,
  file_size   integer,
  mime_type   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_attachments_client_idx ON client_attachments(client_id);
