-- 052_person_restricted_fields.sql
-- "Cada dado e cada documento de cada cliente pode ser marcado individualmente
-- como oculto para os colaboradores" (item 6 do PDF de 18/08/2026).
--
-- PRESENÇA DA LINHA = RESTRITO, em vez de um booleano por campo. Assim o estado
-- normal (campo visível) não ocupa linha nenhuma, e a tabela fica pequena e
-- óbvia de ler. Uma coluna `cpf_restricted`, `cnpj_restricted`... não escala e
-- vira uma migration a cada campo novo.
--
-- field_name é TEXT sem CHECK: a allowlist mora em lib/personVisibility.js
-- (CAMPOS_RESTRINGIVEIS) e a rota só aceita nomes de lá. Duplicar a lista aqui
-- criaria duas verdades que divergem — e a de aplicação é a que manda, porque é
-- ela que remove a chave da resposta.
--
-- SÓ DDL NESTE ARQUIVO. O backfill vive na 053, num arquivo à parte: se os dois
-- estivessem juntos, rodar este arquivo de novo (como o teste de integração faz
-- para provar o backfill) bateria no CREATE TABLE já existente e abortaria o
-- batch inteiro antes de chegar nos INSERTs — mesmo erro que já foi corrigido
-- no par 041/043 (contatos) e que se repetiria aqui sem essa separação.

CREATE TABLE person_restricted_fields (
  client_id   uuid REFERENCES clients(id)   ON DELETE CASCADE,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE CASCADE,
  field_name  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prf_um_dono CHECK (num_nonnulls(client_id, supplier_id) = 1)
);

CREATE UNIQUE INDEX prf_cliente
  ON person_restricted_fields(client_id, field_name)   WHERE client_id   IS NOT NULL;
CREATE UNIQUE INDEX prf_fornecedor
  ON person_restricted_fields(supplier_id, field_name) WHERE supplier_id IS NOT NULL;

-- Contatos e anexos são linhas: o flag vive na própria linha.
ALTER TABLE person_phones      ADD COLUMN IF NOT EXISTS is_restricted boolean NOT NULL DEFAULT false;
ALTER TABLE person_emails      ADD COLUMN IF NOT EXISTS is_restricted boolean NOT NULL DEFAULT false;
ALTER TABLE person_addresses   ADD COLUMN IF NOT EXISTS is_restricted boolean NOT NULL DEFAULT false;
ALTER TABLE client_attachments ADD COLUMN IF NOT EXISTS is_restricted boolean NOT NULL DEFAULT false;
