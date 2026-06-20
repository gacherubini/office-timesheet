-- Templates de projeto: conjuntos reutilizáveis de tarefas que são geradas
-- automaticamente ao criar um projeto a partir do template.
CREATE TABLE IF NOT EXISTS project_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_template_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  priority    task_priority NOT NULL DEFAULT 'medium',
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_template_items_template_idx
  ON project_template_items(template_id);

CREATE TRIGGER project_templates_set_updated_at
  BEFORE UPDATE ON project_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
