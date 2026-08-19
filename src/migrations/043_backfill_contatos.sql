-- 043_backfill_contatos.sql
-- Move os contatos únicos que já existem para as tabelas filhas da 041, cada um
-- marcado como principal.
--
-- AS COLUNAS ANTIGAS NÃO SÃO REMOVIDAS. É o que torna esta migration
-- reversível: se algo der errado em produção, os leitores voltam a lê-las com
-- um revert de CÓDIGO, sem restore de banco. O DROP é uma migration futura,
-- depois de o sistema rodar lendo as tabelas filhas.
--
-- Idempotente por NOT EXISTS: no dia do deploy alguém sempre roda duas vezes.

INSERT INTO person_phones (client_id, label, value, is_primary)
SELECT c.id, 'principal', btrim(c.phone), true
  FROM clients c
 WHERE c.phone IS NOT NULL AND btrim(c.phone) <> ''
   AND NOT EXISTS (SELECT 1 FROM person_phones p WHERE p.client_id = c.id);

INSERT INTO person_emails (client_id, label, value, is_primary)
SELECT c.id, 'principal', btrim(c.email), true
  FROM clients c
 WHERE c.email IS NOT NULL AND btrim(c.email) <> ''
   AND NOT EXISTS (SELECT 1 FROM person_emails e WHERE e.client_id = c.id);

-- Endereço antigo é texto livre; o novo é estruturado. O texto inteiro vai para
-- `street` e NINGUÉM tenta adivinhar rua/número/bairro: parser de endereço
-- brasileiro erra, e um endereço errado é pior que um endereço não estruturado.
-- Quem editar a ficha estrutura na mão, com o CEP ajudando.
INSERT INTO person_addresses (client_id, label, street, is_primary)
SELECT c.id, 'principal', btrim(c.address), true
  FROM clients c
 WHERE c.address IS NOT NULL AND btrim(c.address) <> ''
   AND NOT EXISTS (SELECT 1 FROM person_addresses a WHERE a.client_id = c.id);

INSERT INTO person_phones (supplier_id, label, value, is_primary)
SELECT s.id, 'principal', btrim(s.phone), true
  FROM suppliers s
 WHERE s.phone IS NOT NULL AND btrim(s.phone) <> ''
   AND NOT EXISTS (SELECT 1 FROM person_phones p WHERE p.supplier_id = s.id);

INSERT INTO person_emails (supplier_id, label, value, is_primary)
SELECT s.id, 'principal', btrim(s.email), true
  FROM suppliers s
 WHERE s.email IS NOT NULL AND btrim(s.email) <> ''
   AND NOT EXISTS (SELECT 1 FROM person_emails e WHERE e.supplier_id = s.id);
