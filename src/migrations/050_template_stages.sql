-- 050_template_stages.sql
-- "Ao criar um projeto por template, o sistema já gera as etapas e as
-- tarefas-padrão de cada uma — o projeto nasce estruturado em vez de em
-- branco." Esse é o principal ganho do módulo (item 8 do PDF de ajustes de
-- 18/08/2026).
--
-- template_stage_id é NULLABLE de propósito: templates criados antes deste
-- bloco não têm etapa, e as tarefas deles caem em "Sem etapa" na geração
-- (rota POST /projects). Compatibilidade para trás sem código condicional
-- espalhado pelas leituras.

CREATE TABLE IF NOT EXISTS project_template_stages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
  catalog_id  uuid REFERENCES stage_catalog(id) ON DELETE SET NULL,
  name        text NOT NULL,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, name)
);

CREATE INDEX IF NOT EXISTS project_template_stages_template_idx
  ON project_template_stages(template_id, position);

ALTER TABLE project_template_items
  ADD COLUMN IF NOT EXISTS template_stage_id uuid
    REFERENCES project_template_stages(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS project_template_items_stage_idx
  ON project_template_items(template_stage_id);
