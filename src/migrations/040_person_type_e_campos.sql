-- 040_person_type_e_campos.sql
-- Cliente e fornecedor passam a ser pessoa física OU jurídica (item 3 do PDF de
-- ajustes de 18/08/2026), e ganham dados bancários (exigidos pelo item 6, que
-- manda campo bancário nascer restrito — mas o campo não existia).
--
-- `name` CONTINUA sendo o nome de exibição, inclusive para PJ: ele é lido por
-- GET /projects, pela tool statusProjeto.js do agente e pela tela de Pessoas.
-- Transformá-lo em derivado obrigaria a mexer em todos. Para PJ, a rota de
-- escrita o preenche a partir de nome_fantasia (ou razao_social na falta).
--
-- DEFAULT 'pf' é o que faz o backfill dos existentes ser trivial: todo cliente
-- cadastrado até aqui tem nome e CPF, ou seja, é pessoa física.

DO $$ BEGIN
  CREATE TYPE person_type AS ENUM ('pf', 'pj');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS person_type        person_type NOT NULL DEFAULT 'pf',
  ADD COLUMN IF NOT EXISTS rg                 text,
  ADD COLUMN IF NOT EXISTS razao_social       text,
  ADD COLUMN IF NOT EXISTS nome_fantasia      text,
  ADD COLUMN IF NOT EXISTS cnpj               text,
  ADD COLUMN IF NOT EXISTS inscricao_estadual text,
  ADD COLUMN IF NOT EXISTS founded_date       date,
  ADD COLUMN IF NOT EXISTS bank_name          text,
  ADD COLUMN IF NOT EXISTS bank_agency        text,
  ADD COLUMN IF NOT EXISTS bank_account       text,
  ADD COLUMN IF NOT EXISTS bank_account_type  text,
  ADD COLUMN IF NOT EXISTS pix_key            text;

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS person_type        person_type NOT NULL DEFAULT 'pf',
  ADD COLUMN IF NOT EXISTS cpf                text,
  ADD COLUMN IF NOT EXISTS rg                 text,
  ADD COLUMN IF NOT EXISTS birth_date         date,
  ADD COLUMN IF NOT EXISTS razao_social       text,
  ADD COLUMN IF NOT EXISTS nome_fantasia      text,
  ADD COLUMN IF NOT EXISTS cnpj               text,
  ADD COLUMN IF NOT EXISTS inscricao_estadual text,
  ADD COLUMN IF NOT EXISTS founded_date       date,
  ADD COLUMN IF NOT EXISTS bank_name          text,
  ADD COLUMN IF NOT EXISTS bank_agency        text,
  ADD COLUMN IF NOT EXISTS bank_account       text,
  ADD COLUMN IF NOT EXISTS bank_account_type  text,
  ADD COLUMN IF NOT EXISTS pix_key            text;

-- Coerência mínima: "PJ" sem razão social é um rótulo que não garante nada.
-- Nome do constraint importa — os testes casam por ele.
ALTER TABLE clients   ADD CONSTRAINT clients_pj_precisa_razao_social
  CHECK (person_type = 'pf' OR razao_social IS NOT NULL);
ALTER TABLE suppliers ADD CONSTRAINT suppliers_pj_precisa_razao_social
  CHECK (person_type = 'pf' OR razao_social IS NOT NULL);

CREATE INDEX IF NOT EXISTS clients_person_type_idx   ON clients(person_type);
CREATE INDEX IF NOT EXISTS suppliers_person_type_idx ON suppliers(person_type);
