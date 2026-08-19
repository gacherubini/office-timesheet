-- 053_backfill_restritos.sql
-- Backfill: "nascem restritos por padrão" vale para quem JÁ EXISTE também.
-- O contrário (legado nasce aberto) deixaria justamente os cadastros reais
-- desprotegidos — que são os únicos que existem hoje.
--
-- SEPARADO da 052 (DDL) de propósito, espelhando o par 041/043 do bloco B:
-- rodar este arquivo de novo é seguro (ON CONFLICT DO NOTHING garante
-- idempotência) e não depende de a tabela já existir criada por ELE — ela é
-- criada pela 052. Isso é o que permite ao teste de integração ler e rodar SÓ
-- este arquivo, sem catch, para provar que o backfill de fato roda.

INSERT INTO person_restricted_fields (client_id, field_name)
SELECT c.id, f.field_name
  FROM clients c
 CROSS JOIN (VALUES ('cpf'),('rg'),('cnpj'),
                    ('bank_name'),('bank_agency'),('bank_account'),
                    ('bank_account_type'),('pix_key')) AS f(field_name)
ON CONFLICT DO NOTHING;

INSERT INTO person_restricted_fields (supplier_id, field_name)
SELECT s.id, f.field_name
  FROM suppliers s
 CROSS JOIN (VALUES ('cpf'),('rg'),('cnpj'),
                    ('bank_name'),('bank_agency'),('bank_account'),
                    ('bank_account_type'),('pix_key')) AS f(field_name)
ON CONFLICT DO NOTHING;
