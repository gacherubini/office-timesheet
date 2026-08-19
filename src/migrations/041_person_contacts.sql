-- 041_person_contacts.sql
-- Telefones, e-mails e endereços múltiplos, cada um com rótulo e um marcado
-- como principal (item 2 do PDF de ajustes de 18/08/2026).
--
-- POR QUE UM CONJUNTO SÓ para clientes E fornecedores, com dois FKs anuláveis
-- em vez de tabelas separadas ou FK polimórfica:
--   - Separadas (client_phones + supplier_phones) duplicariam toda a regra de
--     "principal", rótulo e visibilidade — e é onde as duas cópias divergem.
--   - Polimórfica (owner_type + owner_id) perderia a FK declarativa: o banco
--     deixaria de garantir que o dono existe.
--   - Assim, as duas FKs são reais e o CHECK garante exatamente um dono.
--
-- `label` é TEXT e não enum de propósito: o PDF pede lista pronta "com opção de
-- digitar um personalizado". Enum tornaria isso uma migration por rótulo novo.
-- A lista sugerida vive no front (mesmo precedente de web/src/lib/taskTypes.js).

CREATE TABLE person_phones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid REFERENCES clients(id)   ON DELETE CASCADE,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE CASCADE,
  label       text NOT NULL,
  value       text NOT NULL,
  is_primary  boolean NOT NULL DEFAULT false,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT person_phones_um_dono CHECK (num_nonnulls(client_id, supplier_id) = 1)
);

CREATE TABLE person_emails (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid REFERENCES clients(id)   ON DELETE CASCADE,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE CASCADE,
  label       text NOT NULL,
  value       text NOT NULL,
  is_primary  boolean NOT NULL DEFAULT false,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT person_emails_um_dono CHECK (num_nonnulls(client_id, supplier_id) = 1)
);

CREATE TABLE person_addresses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid REFERENCES clients(id)   ON DELETE CASCADE,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE CASCADE,
  label       text NOT NULL,
  cep         text,
  street      text,
  number      text,
  complement  text,
  district    text,
  city        text,
  uf          text,
  is_primary  boolean NOT NULL DEFAULT false,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT person_addresses_um_dono CHECK (num_nonnulls(client_id, supplier_id) = 1)
);

-- "Um marcado como principal" vira invariante do BANCO, não do formulário.
CREATE UNIQUE INDEX person_phones_principal_cliente
  ON person_phones(client_id)   WHERE is_primary AND client_id   IS NOT NULL;
CREATE UNIQUE INDEX person_phones_principal_fornecedor
  ON person_phones(supplier_id) WHERE is_primary AND supplier_id IS NOT NULL;

CREATE UNIQUE INDEX person_emails_principal_cliente
  ON person_emails(client_id)   WHERE is_primary AND client_id   IS NOT NULL;
CREATE UNIQUE INDEX person_emails_principal_fornecedor
  ON person_emails(supplier_id) WHERE is_primary AND supplier_id IS NOT NULL;

CREATE UNIQUE INDEX person_addresses_principal_cliente
  ON person_addresses(client_id)   WHERE is_primary AND client_id   IS NOT NULL;
CREATE UNIQUE INDEX person_addresses_principal_fornecedor
  ON person_addresses(supplier_id) WHERE is_primary AND supplier_id IS NOT NULL;

-- Busca pelo dono é o acesso dominante (montar a ficha).
CREATE INDEX person_phones_cliente_idx       ON person_phones(client_id);
CREATE INDEX person_phones_fornecedor_idx    ON person_phones(supplier_id);
CREATE INDEX person_emails_cliente_idx       ON person_emails(client_id);
CREATE INDEX person_emails_fornecedor_idx    ON person_emails(supplier_id);
CREATE INDEX person_addresses_cliente_idx    ON person_addresses(client_id);
CREATE INDEX person_addresses_fornecedor_idx ON person_addresses(supplier_id);

CREATE TRIGGER person_phones_set_updated_at
  BEFORE UPDATE ON person_phones    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER person_emails_set_updated_at
  BEFORE UPDATE ON person_emails    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER person_addresses_set_updated_at
  BEFORE UPDATE ON person_addresses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
