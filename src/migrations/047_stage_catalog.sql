-- 047_stage_catalog.sql
-- Catálogo padrão de etapas do escritório (item 8 do PDF de ajustes de
-- 18/08/2026). GLOBAL e editável pelo admin.
--
-- Global e não por projeto porque o próprio PDF alerta: "etapas com nomes
-- livres por projeto inviabilizam comparar custo e prazo entre obras".
--
-- Editável porque a lista definitiva é uma "definição pendente" do cliente.
-- Um cadastro que ele mesmo ajusta destrava a implementação sem esperar a
-- resposta — e o seed abaixo já entrega um ponto de partida útil.
--
-- is_archived em vez de DELETE: etapa já usada por uma obra não pode sumir.
--
-- IF NOT EXISTS no CREATE TABLE/INDEX: os testes de migration (stageCatalog e
-- taskStageBackfill) leem este arquivo e o reexecutam contra um banco onde ele
-- já rodou de verdade (globalSetup aplica as migrações uma vez antes da
-- suíte). Sem os guardas, a segunda execução quebraria em "relation already
-- exists" — os INSERTs abaixo já são seguros via ON CONFLICT.

CREATE TABLE IF NOT EXISTS stage_catalog (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  description text,
  position    integer NOT NULL DEFAULT 0,
  is_archived boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stage_catalog_ordem_idx ON stage_catalog(position, name) WHERE NOT is_archived;

DO $$ BEGIN
  CREATE TRIGGER stage_catalog_set_updated_at
    BEFORE UPDATE ON stage_catalog
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- As dez do PDF, na ordem em que ele as lista.
INSERT INTO stage_catalog (name, position) VALUES
  ('Conceituação', 10),
  ('Estudo de viabilidade', 20),
  ('Estudo de massa', 30),
  ('Estudo preliminar', 40),
  ('Anteprojeto', 50),
  ('Projeto legal', 60),
  ('Projeto arquitetônico', 70),
  ('Complementares', 80),
  ('Executivo', 90),
  ('Acompanhamento de obra', 100)
ON CONFLICT (name) DO NOTHING;

-- MAIS todo task_type que exista em produção e não case com os dez acima.
-- Sem isto, as tarefas marcadas como "Compatibilização", "Detalhamento" e
-- "Reuniões" — que estão na lista em uso hoje (web/src/lib/taskTypes.js) e NÃO
-- estão na do PDF — ficariam órfãs na migration seguinte, com dado real.
--
-- position 900 joga os herdados para o fim: ficam visíveis e separados, e o
-- cliente arquiva ou funde pela tela. "Reuniões" e "Outros" provavelmente vão
-- ser arquivados — não são etapa contratual pela definição do próprio PDF
-- ("tem prazo, tem entrega, costuma ter parcela de pagamento") —, mas essa é
-- decisão dele, não desta migration.
INSERT INTO stage_catalog (name, position)
SELECT DISTINCT btrim(t.task_type), 900
  FROM tasks t
 WHERE t.task_type IS NOT NULL AND btrim(t.task_type) <> ''
ON CONFLICT (name) DO NOTHING;
