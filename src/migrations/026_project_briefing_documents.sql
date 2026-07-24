-- Página do projeto (mockup): briefing textual + documentos anexados.
-- Espelha o padrão de client_attachments (019).

ALTER TABLE projects ADD COLUMN IF NOT EXISTS briefing text;

CREATE TABLE IF NOT EXISTS project_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  file_url    text NOT NULL,
  file_name   text NOT NULL,
  file_size   integer,
  mime_type   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_documents_project_idx ON project_documents(project_id);
