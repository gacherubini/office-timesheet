# Bloco B — Pessoas: PF/PJ, contatos múltiplos, CEP, admissão e cargo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O cadastro de clientes e fornecedores sai de "um campo de cada coisa" para pessoa física ou jurídica, com quantos telefones, e-mails e endereços forem necessários — cada um identificado por um rótulo e um marcado como principal — e com pessoas físicas vinculadas a jurídicas pelo cadastro existente.

**Architecture:** Um único conjunto de tabelas filhas atende clientes e fornecedores, com `client_id` e `supplier_id` anuláveis e um `CHECK` de dono exclusivo — FK declarativa de verdade, sem duplicar regra e sem tocar em `clients`, `suppliers` ou `projects.client_id`. As colunas antigas (`email`, `phone`, `address`) sobrevivem populadas até uma migration posterior, o que torna todo o bloco reversível por revert de código.

**Tech Stack:** PostgreSQL 16, Node 20 / Express 5, node-postgres, Vitest + Supertest; React 19, Vite, Vitest + Testing Library; ViaCEP (HTTP público, sem chave).

**Spec:** `docs/superpowers/specs/2026-08-18-ajustes-void-b-pessoas-design.md`

## Global Constraints

- **Existe dado real em produção.** Nenhuma migration pode perder informação. As colunas `clients.email`, `clients.phone`, `clients.address` (e as equivalentes em `suppliers`) **não são removidas neste plano** — nem no fim dele.
- **Abrangência:** clientes e fornecedores. A tabela `users` recebe **apenas** os itens 4 e 5 (Tasks 10 e 11). Não acrescente contatos múltiplos a `users` — ela é lida por auth, `userCache`, agente e relatórios, e é o maior risco de regressão do projeto.
- **`clients.name` continua sendo o nome de exibição**, inclusive para PJ. É lido por `GET /projects`, pela tool `statusProjeto.js` do agente e pela tela de Pessoas. Para PJ, o save o preenche a partir de `nome_fantasia` (ou `razao_social` na falta).
- **`name` nunca é restringível.** Se você chegou aqui vindo do bloco D, isso já vale.
- Migrations rodam **dentro de uma transação** (`scripts/migrate.js`) e são registradas em `_migrations` por nome de arquivo, aplicadas em ordem de `.sort()`. Numere na ordem de dependência.
- Rótulos de contato são `text`, **não** enum: o PDF pede lista pronta "com opção de digitar um personalizado".
- Banco de teste local: `DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test"` (a 5432 costuma estar ocupada por outro container).
- Baseline da API antes deste plano: 133 arquivos / 857 testes (com o bloco A1 aplicado).
- Comentários e mensagens de erro em **português**.

---

### Task 1: Migration 040 — tipo de pessoa, campos de PJ e dados bancários

**Files:**
- Create: `src/migrations/040_person_type_e_campos.sql`
- Test: `src/tests/integration/personSchema.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `clients.person_type` e `suppliers.person_type` (`'pf' | 'pj'`), mais os campos de PJ e bancários nas duas tabelas.

- [ ] **Step 1: Write the failing test**

Create `src/tests/integration/personSchema.test.js`:

```js
// Os CHECKs desta migration são a razão de ela existir: sem eles, "PJ" vira um
// rótulo que não garante nada, e um dia aparece uma pessoa jurídica sem razão
// social no meio de um contrato.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'

describe('040 — pessoa física e jurídica', () => {
  beforeEach(async () => { await resetDb() })

  it('cliente nasce como pessoa física', async () => {
    const { rows } = await query(
      `INSERT INTO clients (name) VALUES ('Fulano') RETURNING person_type`,
    )
    expect(rows[0].person_type).toBe('pf')
  })

  it('fornecedor nasce como pessoa física', async () => {
    const { rows } = await query(
      `INSERT INTO suppliers (name) VALUES ('Marcenaria') RETURNING person_type`,
    )
    expect(rows[0].person_type).toBe('pf')
  })

  it('aceita PJ com razão social', async () => {
    const { rows } = await query(
      `INSERT INTO clients (name, person_type, razao_social, cnpj)
       VALUES ('Construtora X', 'pj', 'Construtora X Ltda', '11.111.111/0001-11')
       RETURNING person_type, razao_social`,
    )
    expect(rows[0].person_type).toBe('pj')
    expect(rows[0].razao_social).toBe('Construtora X Ltda')
  })

  it('recusa PJ sem razão social', async () => {
    await expect(
      query(`INSERT INTO clients (name, person_type) VALUES ('Construtora X', 'pj')`),
    ).rejects.toThrow(/clients_pj_precisa_razao_social/)
  })

  it('recusa fornecedor PJ sem razão social', async () => {
    await expect(
      query(`INSERT INTO suppliers (name, person_type) VALUES ('Marcenaria', 'pj')`),
    ).rejects.toThrow(/suppliers_pj_precisa_razao_social/)
  })

  it('recusa person_type fora do enum', async () => {
    await expect(
      query(`INSERT INTO clients (name, person_type) VALUES ('X', 'mei')`),
    ).rejects.toThrow(/invalid input value for enum/)
  })

  it('guarda dados bancários em cliente e fornecedor', async () => {
    const { rows: c } = await query(
      `INSERT INTO clients (name, bank_name, bank_agency, bank_account, bank_account_type, pix_key)
       VALUES ('Fulano', 'Itaú', '1234', '56789-0', 'corrente', 'fulano@x.com')
       RETURNING bank_name, pix_key`,
    )
    expect(c[0].bank_name).toBe('Itaú')
    expect(c[0].pix_key).toBe('fulano@x.com')

    const { rows: s } = await query(
      `INSERT INTO suppliers (name, bank_name, pix_key)
       VALUES ('Marcenaria', 'Bradesco', '11.111.111/0001-11')
       RETURNING bank_name, pix_key`,
    )
    expect(s[0].bank_name).toBe('Bradesco')
  })

  it('cliente PF guarda RG', async () => {
    const { rows } = await query(
      `INSERT INTO clients (name, rg) VALUES ('Fulano', '12.345.678-9') RETURNING rg`,
    )
    expect(rows[0].rg).toBe('12.345.678-9')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/personSchema.test.js
```

Expected: FAIL — `column "person_type" does not exist`.

- [ ] **Step 3: Escrever a migration**

Create `src/migrations/040_person_type_e_campos.sql`:

```sql
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/personSchema.test.js
```

Expected: PASS, 8 testes. Se der `type "person_type" already exists`, o banco de teste tem uma tentativa anterior — derrube e suba o container de novo.

- [ ] **Step 5: Commit**

```bash
git add src/migrations/040_person_type_e_campos.sql src/tests/integration/personSchema.test.js
git commit -m "feat(db): cliente e fornecedor viram pessoa física ou jurídica"
```

---

### Task 2: Migration 041 — telefones, e-mails e endereços

**Files:**
- Create: `src/migrations/041_person_contacts.sql`
- Test: `src/tests/integration/personContacts.test.js`

**Interfaces:**
- Consumes: Task 1.
- Produces: `person_phones`, `person_emails`, `person_addresses`, cada uma com `client_id` XOR `supplier_id`, `label`, `is_primary`, `position`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/integration/personContacts.test.js`:

```js
// O índice parcial de "principal" é o coração destas tabelas. O PDF pede "um
// marcado como principal (o que aparece nas listagens)" — deixar isso só na UI
// garante que um dia existam dois principais e a listagem escolha por sorte.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'

async function novoCliente(nome = 'Fulano') {
  const { rows } = await query(`INSERT INTO clients (name) VALUES ($1) RETURNING id`, [nome])
  return rows[0].id
}
async function novoFornecedor(nome = 'Marcenaria') {
  const { rows } = await query(`INSERT INTO suppliers (name) VALUES ($1) RETURNING id`, [nome])
  return rows[0].id
}

describe('041 — contatos múltiplos', () => {
  let cliente
  beforeEach(async () => {
    await resetDb()
    cliente = await novoCliente()
  })

  it('guarda dois telefones com rótulos diferentes', async () => {
    await query(
      `INSERT INTO person_phones (client_id, label, value, is_primary, position)
       VALUES ($1, 'celular', '11999990000', true, 0),
              ($1, 'comercial', '1133330000', false, 1)`,
      [cliente],
    )
    const { rows } = await query(
      `SELECT label, value, is_primary FROM person_phones WHERE client_id = $1 ORDER BY position`,
      [cliente],
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].label).toBe('celular')
    expect(rows[0].is_primary).toBe(true)
    expect(rows[1].label).toBe('comercial')
    expect(rows[1].is_primary).toBe(false)
  })

  it('aceita rótulo personalizado', async () => {
    await query(
      `INSERT INTO person_phones (client_id, label, value) VALUES ($1, 'telefone da portaria', '1122223333')`,
      [cliente],
    )
    const { rows } = await query(`SELECT label FROM person_phones WHERE client_id = $1`, [cliente])
    expect(rows[0].label).toBe('telefone da portaria')
  })

  it('recusa dois principais do mesmo tipo no mesmo cliente', async () => {
    await query(
      `INSERT INTO person_phones (client_id, label, value, is_primary) VALUES ($1, 'celular', '1', true)`,
      [cliente],
    )
    await expect(
      query(`INSERT INTO person_phones (client_id, label, value, is_primary) VALUES ($1, 'comercial', '2', true)`,
        [cliente]),
    ).rejects.toThrow(/person_phones_principal_cliente/)
  })

  it('dois clientes podem ter cada um o seu principal', async () => {
    const outro = await novoCliente('Sicrano')
    await query(
      `INSERT INTO person_phones (client_id, label, value, is_primary) VALUES ($1, 'celular', '1', true)`,
      [cliente],
    )
    await query(
      `INSERT INTO person_phones (client_id, label, value, is_primary) VALUES ($1, 'celular', '2', true)`,
      [outro],
    )
    const { rows } = await query(`SELECT count(*)::int AS c FROM person_phones WHERE is_primary`)
    expect(rows[0].c).toBe(2)
  })

  it('recusa linha com cliente E fornecedor', async () => {
    const forn = await novoFornecedor()
    await expect(
      query(`INSERT INTO person_phones (client_id, supplier_id, label, value) VALUES ($1, $2, 'celular', '1')`,
        [cliente, forn]),
    ).rejects.toThrow(/person_phones_um_dono/)
  })

  it('recusa linha órfã (sem cliente nem fornecedor)', async () => {
    await expect(
      query(`INSERT INTO person_phones (label, value) VALUES ('celular', '1')`),
    ).rejects.toThrow(/person_phones_um_dono/)
  })

  it('apagar o cliente leva os contatos junto', async () => {
    await query(
      `INSERT INTO person_phones (client_id, label, value) VALUES ($1, 'celular', '1')`, [cliente])
    await query(`INSERT INTO person_emails (client_id, label, value) VALUES ($1, 'pessoal', 'a@b.c')`, [cliente])
    await query(`DELETE FROM clients WHERE id = $1`, [cliente])
    const { rows } = await query(
      `SELECT (SELECT count(*)::int FROM person_phones) AS tel,
              (SELECT count(*)::int FROM person_emails) AS mail`)
    expect(rows[0].tel).toBe(0)
    expect(rows[0].mail).toBe(0)
  })

  it('endereço guarda os campos separados que o CEP preenche', async () => {
    await query(
      `INSERT INTO person_addresses (client_id, label, cep, street, number, complement, district, city, uf, is_primary)
       VALUES ($1, 'obra', '01310-100', 'Av. Paulista', '1000', 'sala 5', 'Bela Vista', 'São Paulo', 'SP', true)`,
      [cliente],
    )
    const { rows } = await query(
      `SELECT cep, street, district, city, uf FROM person_addresses WHERE client_id = $1`, [cliente])
    expect(rows[0].cep).toBe('01310-100')
    expect(rows[0].street).toBe('Av. Paulista')
    expect(rows[0].city).toBe('São Paulo')
    expect(rows[0].uf).toBe('SP')
  })

  it('as três tabelas valem para fornecedor também', async () => {
    const forn = await novoFornecedor()
    await query(`INSERT INTO person_phones (supplier_id, label, value, is_primary) VALUES ($1, 'comercial', '1', true)`, [forn])
    await query(`INSERT INTO person_emails (supplier_id, label, value, is_primary) VALUES ($1, 'financeiro', 'nf@x.com', true)`, [forn])
    await query(`INSERT INTO person_addresses (supplier_id, label, city, is_primary) VALUES ($1, 'sede', 'Curitiba', true)`, [forn])
    const { rows } = await query(
      `SELECT (SELECT count(*)::int FROM person_phones    WHERE supplier_id = $1) AS tel,
              (SELECT count(*)::int FROM person_emails    WHERE supplier_id = $1) AS mail,
              (SELECT count(*)::int FROM person_addresses WHERE supplier_id = $1) AS end`,
      [forn])
    expect(rows[0].tel).toBe(1)
    expect(rows[0].mail).toBe(1)
    expect(rows[0].end).toBe(1)
  })

  it('recusa dois e-mails principais e dois endereços principais', async () => {
    await query(`INSERT INTO person_emails (client_id, label, value, is_primary) VALUES ($1, 'pessoal', 'a@b.c', true)`, [cliente])
    await expect(
      query(`INSERT INTO person_emails (client_id, label, value, is_primary) VALUES ($1, 'comercial', 'd@e.f', true)`, [cliente]),
    ).rejects.toThrow(/person_emails_principal_cliente/)

    await query(`INSERT INTO person_addresses (client_id, label, city, is_primary) VALUES ($1, 'sede', 'SP', true)`, [cliente])
    await expect(
      query(`INSERT INTO person_addresses (client_id, label, city, is_primary) VALUES ($1, 'obra', 'RJ', true)`, [cliente]),
    ).rejects.toThrow(/person_addresses_principal_cliente/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/personContacts.test.js
```

Expected: FAIL — `relation "person_phones" does not exist`.

- [ ] **Step 3: Escrever a migration**

Create `src/migrations/041_person_contacts.sql`:

```sql
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
```

- [ ] **Step 4: Acrescentar as tabelas novas ao reset dos testes**

Em `src/tests/helpers/db.js`, o `TRUNCATE` precisa alcançá-las. Como todas cascateiam de `clients`/`suppliers`, o `CASCADE` já dá conta — mas `suppliers` **não está** na lista de hoje. Acrescente-a:

```js
    TRUNCATE
      users, projects, clients, suppliers,
      time_entries, time_entry_pauses, time_entry_change_requests,
      vacation_requests, notifications
    RESTART IDENTITY CASCADE
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/personContacts.test.js
```

Expected: PASS, 10 testes.

- [ ] **Step 6: Rodar a suíte inteira**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run
```

Expected: PASS. Atenção ao `contactsVisibility.test.js`: ele insere fornecedores no `beforeEach` e agora eles são truncados entre testes — era exatamente o que faltava.

- [ ] **Step 7: Commit**

```bash
git add src/migrations/041_person_contacts.sql src/tests/integration/personContacts.test.js src/tests/helpers/db.js
git commit -m "feat(db): telefones, e-mails e endereços múltiplos com rótulo e principal"
```

---

### Task 3: Migration 042 — vínculo entre pessoa jurídica e física

**Files:**
- Create: `src/migrations/042_person_links.sql`
- Test: `src/tests/integration/personLinks.test.js`

**Interfaces:**
- Consumes: Tasks 1 e 2.
- Produces: `person_links` com `role` em `socio | responsavel_tecnico | contato_principal | financeiro`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/integration/personLinks.test.js`:

```js
// "O vínculo é feito pelo cadastro existente, nunca por texto digitado — evita
// a mesma pessoa duplicada" (PDF, item 3). É por isso que o membro é FK e não
// text: o banco recusa um sócio que não existe.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'

async function pj(nome) {
  const { rows } = await query(
    `INSERT INTO clients (name, person_type, razao_social) VALUES ($1, 'pj', $1) RETURNING id`, [nome])
  return rows[0].id
}
async function pf(nome) {
  const { rows } = await query(`INSERT INTO clients (name) VALUES ($1) RETURNING id`, [nome])
  return rows[0].id
}

describe('042 — vínculo PJ ↔ PF', () => {
  let construtora, socio, financeiro
  beforeEach(async () => {
    await resetDb()
    construtora = await pj('Construtora X')
    socio = await pf('João Sócio')
    financeiro = await pf('Maria Financeiro')
  })

  it('uma PJ tem várias PF com papéis diferentes', async () => {
    await query(
      `INSERT INTO person_links (company_client_id, member_client_id, role)
       VALUES ($1, $2, 'socio'), ($1, $3, 'financeiro')`,
      [construtora, socio, financeiro],
    )
    const { rows } = await query(
      `SELECT c.name, l.role FROM person_links l
       JOIN clients c ON c.id = l.member_client_id
       WHERE l.company_client_id = $1 ORDER BY l.role`,
      [construtora],
    )
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.role)).toEqual(['financeiro', 'socio'])
    expect(rows.map((r) => r.name)).toContain('João Sócio')
  })

  it('recusa membro que não existe no cadastro', async () => {
    await expect(
      query(`INSERT INTO person_links (company_client_id, member_client_id, role)
             VALUES ($1, '00000000-0000-0000-0000-000000000000', 'socio')`, [construtora]),
    ).rejects.toThrow(/violates foreign key constraint/)
  })

  it('recusa papel fora da lista', async () => {
    await expect(
      query(`INSERT INTO person_links (company_client_id, member_client_id, role)
             VALUES ($1, $2, 'primo')`, [construtora, socio]),
    ).rejects.toThrow(/person_links_papel_valido/)
  })

  it('recusa vínculo entre lados diferentes (PJ cliente ↔ PF fornecedor)', async () => {
    const { rows } = await query(`INSERT INTO suppliers (name) VALUES ('Zé') RETURNING id`)
    await expect(
      query(`INSERT INTO person_links (company_client_id, member_supplier_id, role)
             VALUES ($1, $2, 'socio')`, [construtora, rows[0].id]),
    ).rejects.toThrow(/person_links_mesmo_lado/)
  })

  it('recusa vínculo sem empresa', async () => {
    await expect(
      query(`INSERT INTO person_links (member_client_id, role) VALUES ($1, 'socio')`, [socio]),
    ).rejects.toThrow(/person_links_uma_empresa/)
  })

  it('recusa duas empresas na mesma linha', async () => {
    const { rows } = await query(`INSERT INTO suppliers (name) VALUES ('Forn') RETURNING id`)
    await expect(
      query(`INSERT INTO person_links (company_client_id, company_supplier_id, member_client_id, role)
             VALUES ($1, $2, $3, 'socio')`, [construtora, rows[0].id, socio]),
    ).rejects.toThrow(/person_links_uma_empresa/)
  })

  it('recusa o mesmo par duas vezes', async () => {
    await query(`INSERT INTO person_links (company_client_id, member_client_id, role)
                 VALUES ($1, $2, 'socio')`, [construtora, socio])
    await expect(
      query(`INSERT INTO person_links (company_client_id, member_client_id, role)
             VALUES ($1, $2, 'contato_principal')`, [construtora, socio]),
    ).rejects.toThrow(/person_links_par_cliente/)
  })

  it('apagar a PJ leva os vínculos, não as PF', async () => {
    await query(`INSERT INTO person_links (company_client_id, member_client_id, role)
                 VALUES ($1, $2, 'socio')`, [construtora, socio])
    await query(`DELETE FROM clients WHERE id = $1`, [construtora])
    const { rows } = await query(
      `SELECT (SELECT count(*)::int FROM person_links) AS v,
              (SELECT count(*)::int FROM clients WHERE id = $1) AS pf`, [socio])
    expect(rows[0].v).toBe(0)
    expect(rows[0].pf).toBe(1)
  })

  it('vale para fornecedor PJ com fornecedor PF', async () => {
    const { rows: e } = await query(
      `INSERT INTO suppliers (name, person_type, razao_social) VALUES ('Marcenaria SA','pj','Marcenaria SA') RETURNING id`)
    const { rows: p } = await query(`INSERT INTO suppliers (name) VALUES ('Zé Marceneiro') RETURNING id`)
    await query(`INSERT INTO person_links (company_supplier_id, member_supplier_id, role)
                 VALUES ($1, $2, 'responsavel_tecnico')`, [e[0].id, p[0].id])
    const { rows } = await query(`SELECT count(*)::int AS c FROM person_links`)
    expect(rows[0].c).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/personLinks.test.js
```

Expected: FAIL — `relation "person_links" does not exist`.

- [ ] **Step 3: Escrever a migration**

Create `src/migrations/042_person_links.sql`:

```sql
-- 042_person_links.sql
-- "Uma PJ pode ter várias PF vinculadas, cada uma com um papel" (item 3 do PDF
-- de ajustes de 18/08/2026).
--
-- member_* é FK e NÃO text porque o PDF é explícito: "o vínculo é feito pelo
-- cadastro existente, nunca por texto digitado — evita a mesma pessoa
-- duplicada". Com FK, o banco recusa um sócio que não existe.
--
-- person_links_mesmo_lado evita a pergunta sem resposta "o sócio de um
-- fornecedor é um cliente?": PJ cliente vincula PF cliente, PJ fornecedor
-- vincula PF fornecedor. Não há caso de uso para cruzar os dois, e permitir
-- isso só criaria dado que ninguém sabe interpretar.

CREATE TABLE person_links (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_client_id   uuid REFERENCES clients(id)   ON DELETE CASCADE,
  company_supplier_id uuid REFERENCES suppliers(id) ON DELETE CASCADE,
  member_client_id    uuid REFERENCES clients(id)   ON DELETE CASCADE,
  member_supplier_id  uuid REFERENCES suppliers(id) ON DELETE CASCADE,
  role                text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT person_links_uma_empresa
    CHECK (num_nonnulls(company_client_id, company_supplier_id) = 1),
  CONSTRAINT person_links_uma_pessoa
    CHECK (num_nonnulls(member_client_id, member_supplier_id) = 1),
  -- Empresa e membro vivem do mesmo lado.
  CONSTRAINT person_links_mesmo_lado
    CHECK ((company_client_id IS NULL) = (member_client_id IS NULL)),
  -- Papéis do item 7 do PDF. TEXT + CHECK em vez de enum: acrescentar papel
  -- vira uma migration de uma linha, sem ALTER TYPE.
  CONSTRAINT person_links_papel_valido
    CHECK (role IN ('socio', 'responsavel_tecnico', 'contato_principal', 'financeiro'))
);

-- O mesmo par não se repete, independente do papel: dois papéis para a mesma
-- pessoa na mesma empresa é edição, não linha nova.
CREATE UNIQUE INDEX person_links_par_cliente
  ON person_links(company_client_id, member_client_id)
  WHERE company_client_id IS NOT NULL;
CREATE UNIQUE INDEX person_links_par_fornecedor
  ON person_links(company_supplier_id, member_supplier_id)
  WHERE company_supplier_id IS NOT NULL;

-- "Em quais empresas esta pessoa aparece?" é a pergunta da ficha da PF.
CREATE INDEX person_links_membro_cliente_idx    ON person_links(member_client_id);
CREATE INDEX person_links_membro_fornecedor_idx ON person_links(member_supplier_id);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/personLinks.test.js
```

Expected: PASS, 9 testes.

- [ ] **Step 5: Commit**

```bash
git add src/migrations/042_person_links.sql src/tests/integration/personLinks.test.js
git commit -m "feat(db): vínculo entre pessoa jurídica e física com papel"
```

---

### Task 4: Migration 043 — backfill dos contatos que já existem

**Files:**
- Create: `src/migrations/043_backfill_contatos.sql`
- Test: `src/tests/integration/personBackfill.test.js`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: toda linha de `clients`/`suppliers` com `email`, `phone` ou `address` preenchidos ganha a linha principal correspondente.

- [ ] **Step 1: Entender o problema antes de escrever o teste**

O runner aplica cada migration **uma vez** e registra em `_migrations`. No banco de teste, o `globalSetup` roda as migrations **antes** de qualquer `resetDb()`, e o `TRUNCATE` apaga tudo depois. Ou seja: **você não consegue testar o backfill observando o resultado dele no banco de teste** — quando o teste roda, a tabela está vazia.

A saída é testar o **SQL** do backfill, não a aplicação dele: o teste insere dados no formato antigo e roda o mesmo SQL do arquivo, lido do disco. Assim o que está sob teste é exatamente o texto que vai rodar em produção.

- [ ] **Step 2: Write the failing test**

Create `src/tests/integration/personBackfill.test.js`:

```js
// Backfill com dado REAL em produção: cada linha destas asserções é um jeito de
// perder informação de cliente na virada. O SQL testado é lido do próprio
// arquivo de migration — não uma cópia que pode divergir dele.
import { describe, it, expect, beforeEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resetDb, query } from '../helpers/db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ARQUIVO = path.resolve(__dirname, '../../migrations/043_backfill_contatos.sql')

async function rodarBackfill() {
  const sql = await readFile(ARQUIVO, 'utf8')
  await query(sql)
}

describe('043 — backfill dos contatos antigos', () => {
  beforeEach(async () => { await resetDb() })

  it('telefone antigo vira telefone principal', async () => {
    const { rows } = await query(
      `INSERT INTO clients (name, phone) VALUES ('Fulano', '11999990000') RETURNING id`)
    await rodarBackfill()
    const { rows: tel } = await query(
      `SELECT label, value, is_primary FROM person_phones WHERE client_id = $1`, [rows[0].id])
    expect(tel).toHaveLength(1)
    expect(tel[0].value).toBe('11999990000')
    expect(tel[0].is_primary).toBe(true)
    expect(tel[0].label).toBe('principal')
  })

  it('e-mail antigo vira e-mail principal', async () => {
    const { rows } = await query(
      `INSERT INTO clients (name, email) VALUES ('Fulano', 'a@b.c') RETURNING id`)
    await rodarBackfill()
    const { rows: mail } = await query(
      `SELECT value, is_primary FROM person_emails WHERE client_id = $1`, [rows[0].id])
    expect(mail[0].value).toBe('a@b.c')
    expect(mail[0].is_primary).toBe(true)
  })

  // Endereço antigo é TEXTO LIVRE e o modelo novo é estruturado. O texto inteiro
  // vai para `street` e ninguém tenta adivinhar rua/número/cidade: parser de
  // endereço brasileiro erra, e errar aqui é pior que não estruturar.
  it('endereço antigo vai inteiro para street, sem adivinhação', async () => {
    const { rows } = await query(
      `INSERT INTO clients (name, address) VALUES ('Fulano', 'Rua das Flores, 123 - Centro, São Paulo/SP') RETURNING id`)
    await rodarBackfill()
    const { rows: end } = await query(
      `SELECT street, city, number, is_primary FROM person_addresses WHERE client_id = $1`, [rows[0].id])
    expect(end[0].street).toBe('Rua das Flores, 123 - Centro, São Paulo/SP')
    expect(end[0].city).toBeNull()
    expect(end[0].number).toBeNull()
    expect(end[0].is_primary).toBe(true)
  })

  it('cliente sem contato nenhum não gera linha', async () => {
    await query(`INSERT INTO clients (name) VALUES ('Vazio')`)
    await rodarBackfill()
    const { rows } = await query(
      `SELECT (SELECT count(*)::int FROM person_phones) AS t,
              (SELECT count(*)::int FROM person_emails) AS e,
              (SELECT count(*)::int FROM person_addresses) AS a`)
    expect(rows[0]).toEqual({ t: 0, e: 0, a: 0 })
  })

  it('string em branco não gera linha', async () => {
    await query(`INSERT INTO clients (name, phone, email, address) VALUES ('Branco', '   ', '', '  ')`)
    await rodarBackfill()
    const { rows } = await query(`SELECT count(*)::int AS c FROM person_phones`)
    expect(rows[0].c).toBe(0)
  })

  it('fornecedor também é migrado', async () => {
    const { rows } = await query(
      `INSERT INTO suppliers (name, phone, email) VALUES ('Marcenaria', '1133330000', 'nf@x.com') RETURNING id`)
    await rodarBackfill()
    const { rows: r } = await query(
      `SELECT (SELECT count(*)::int FROM person_phones WHERE supplier_id = $1) AS t,
              (SELECT count(*)::int FROM person_emails WHERE supplier_id = $1) AS e`, [rows[0].id])
    expect(r[0]).toEqual({ t: 1, e: 1 })
  })

  // Rodar de novo não pode duplicar: no dia do deploy alguém sempre roda duas
  // vezes por engano, e o índice de principal transformaria isso num erro feio.
  it('é idempotente', async () => {
    await query(`INSERT INTO clients (name, phone) VALUES ('Fulano', '11999990000')`)
    await rodarBackfill()
    await rodarBackfill()
    const { rows } = await query(`SELECT count(*)::int AS c FROM person_phones`)
    expect(rows[0].c).toBe(1)
  })

  it('as colunas antigas continuam preenchidas — a migration é reversível', async () => {
    const { rows } = await query(
      `INSERT INTO clients (name, phone, email, address)
       VALUES ('Fulano', '11999990000', 'a@b.c', 'Rua X') RETURNING id`)
    await rodarBackfill()
    const { rows: c } = await query(
      `SELECT phone, email, address FROM clients WHERE id = $1`, [rows[0].id])
    expect(c[0].phone).toBe('11999990000')
    expect(c[0].email).toBe('a@b.c')
    expect(c[0].address).toBe('Rua X')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/personBackfill.test.js
```

Expected: FAIL — `ENOENT: no such file or directory` (o arquivo da migration não existe).

- [ ] **Step 4: Escrever a migration**

Create `src/migrations/043_backfill_contatos.sql`:

```sql
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
```

`suppliers` não tem coluna `address` (veja a migration 005) — por isso não há bloco de endereço para fornecedor.

- [ ] **Step 5: Run test to verify it passes**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/personBackfill.test.js
```

Expected: PASS, 8 testes.

- [ ] **Step 6: Commit**

```bash
git add src/migrations/043_backfill_contatos.sql src/tests/integration/personBackfill.test.js
git commit -m "feat(db): backfill dos contatos únicos para as tabelas filhas"
```

---

### Task 5: `lib/personContacts.js` — a regra de "principal" num lugar só

**Files:**
- Create: `src/lib/personContacts.js`
- Test: `src/tests/unit/personContacts.test.js`

**Interfaces:**
- Consumes: nada (função pura).
- Produces:
  - `normalizarContatos(lista, { tipo }): { error } | { itens }` — apara, valida e garante **exatamente um** principal.
  - `LABELS_SUGERIDOS: { phone: string[], email: string[], address: string[] }`

- [ ] **Step 1: Write the failing test**

A regra de "um principal, e se ninguém marcar promove o primeiro" vale para cliente e para fornecedor, para telefone, e-mail e endereço. São seis combinações — se cada rota implementar a sua, elas divergem. Função pura, testável isolada, mesmo precedente de `lib/birthdays.js`.

Create `src/tests/unit/personContacts.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { normalizarContatos, LABELS_SUGERIDOS } from '../../lib/personContacts.js'

describe('normalizarContatos', () => {
  it('lista vazia é válida e devolve vazio', () => {
    expect(normalizarContatos([], { tipo: 'phone' })).toEqual({ itens: [] })
    expect(normalizarContatos(undefined, { tipo: 'phone' })).toEqual({ itens: [] })
  })

  it('promove o primeiro quando ninguém marca principal', () => {
    const { itens } = normalizarContatos(
      [{ label: 'celular', value: '1' }, { label: 'comercial', value: '2' }],
      { tipo: 'phone' },
    )
    expect(itens[0].is_primary).toBe(true)
    expect(itens[1].is_primary).toBe(false)
  })

  it('respeita o principal marcado', () => {
    const { itens } = normalizarContatos(
      [{ label: 'celular', value: '1' }, { label: 'comercial', value: '2', is_primary: true }],
      { tipo: 'phone' },
    )
    expect(itens[0].is_primary).toBe(false)
    expect(itens[1].is_primary).toBe(true)
  })

  // Mensagem legível em vez de deixar o índice parcial do banco estourar com
  // "duplicate key value violates unique constraint person_phones_principal_..."
  it('recusa dois principais com erro em português', () => {
    const r = normalizarContatos(
      [{ label: 'celular', value: '1', is_primary: true },
       { label: 'comercial', value: '2', is_primary: true }],
      { tipo: 'phone' },
    )
    expect(r.error).toMatch(/apenas um telefone/i)
  })

  it('recusa item sem rótulo', () => {
    const r = normalizarContatos([{ label: '  ', value: '1' }], { tipo: 'phone' })
    expect(r.error).toMatch(/rótulo/i)
  })

  it('recusa item sem valor', () => {
    const r = normalizarContatos([{ label: 'celular', value: '' }], { tipo: 'phone' })
    expect(r.error).toMatch(/vazio/i)
  })

  it('apara espaços de rótulo e valor', () => {
    const { itens } = normalizarContatos([{ label: '  celular ', value: ' 11999 ' }], { tipo: 'phone' })
    expect(itens[0].label).toBe('celular')
    expect(itens[0].value).toBe('11999')
  })

  it('numera a posição pela ordem recebida', () => {
    const { itens } = normalizarContatos(
      [{ label: 'a', value: '1' }, { label: 'b', value: '2' }, { label: 'c', value: '3' }],
      { tipo: 'phone' },
    )
    expect(itens.map((i) => i.position)).toEqual([0, 1, 2])
  })

  it('endereço valida rótulo mas aceita campos vazios', () => {
    const { itens } = normalizarContatos(
      [{ label: 'obra', cep: '01310-100', street: 'Av. Paulista' }],
      { tipo: 'address' },
    )
    expect(itens[0].label).toBe('obra')
    expect(itens[0].cep).toBe('01310-100')
    expect(itens[0].number).toBeNull()
  })

  it('endereço sem nenhum campo preenchido é recusado', () => {
    const r = normalizarContatos([{ label: 'obra' }], { tipo: 'address' })
    expect(r.error).toMatch(/vazio/i)
  })

  it('a mensagem cita o tipo certo', () => {
    const dois = [{ label: 'a', value: '1', is_primary: true }, { label: 'b', value: '2', is_primary: true }]
    expect(normalizarContatos(dois, { tipo: 'email' }).error).toMatch(/apenas um e-mail/i)
    const doisEnd = [{ label: 'a', city: 'SP', is_primary: true }, { label: 'b', city: 'RJ', is_primary: true }]
    expect(normalizarContatos(doisEnd, { tipo: 'address' }).error).toMatch(/apenas um endereço/i)
  })

  it('expõe os rótulos sugeridos do PDF', () => {
    expect(LABELS_SUGERIDOS.phone).toContain('celular')
    expect(LABELS_SUGERIDOS.phone).toContain('WhatsApp')
    expect(LABELS_SUGERIDOS.email).toContain('financeiro / nota fiscal')
    expect(LABELS_SUGERIDOS.address).toContain('obra')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src && npx vitest run tests/unit/personContacts.test.js
```

Expected: FAIL — `Failed to resolve import "../../lib/personContacts.js"`.

- [ ] **Step 3: Implementar**

Create `src/lib/personContacts.js`:

```js
// Regra de contato múltiplo num lugar só. Vale para cliente e fornecedor, para
// telefone, e-mail e endereço — seis combinações. Se cada rota implementasse a
// sua, elas divergiriam, e "principal" é justamente o que a listagem mostra.
//
// Função PURA, sem banco: testável isolada, mesmo precedente de lib/birthdays.js
// e lib/performanceSimulation.js.

// Sugestões do item 2 do PDF de 18/08/2026. O banco aceita qualquer texto — o
// PDF pede lista pronta "com opção de digitar um personalizado" —, então isto é
// sugestão, não validação.
export const LABELS_SUGERIDOS = {
  phone: ['celular', 'WhatsApp', 'comercial', 'residencial', 'recado'],
  email: ['pessoal', 'comercial', 'financeiro / nota fiscal'],
  address: ['residencial', 'sede', 'obra', 'cobrança'],
}

const NOME_DO_TIPO = {
  phone: { singular: 'telefone', artigo: 'um telefone' },
  email: { singular: 'e-mail', artigo: 'um e-mail' },
  address: { singular: 'endereço', artigo: 'um endereço' },
}

const CAMPOS_ENDERECO = ['cep', 'street', 'number', 'complement', 'district', 'city', 'uf']

function texto(v) {
  if (v === undefined || v === null) return null
  const t = String(v).trim()
  return t || null
}

export function normalizarContatos(lista, { tipo }) {
  const nome = NOME_DO_TIPO[tipo]
  if (!nome) return { error: `Tipo de contato desconhecido: ${tipo}.` }

  const entrada = Array.isArray(lista) ? lista : []
  if (entrada.length === 0) return { itens: [] }

  const itens = []
  for (const bruto of entrada) {
    const label = texto(bruto?.label)
    if (!label) return { error: `Todo ${nome.singular} precisa de um rótulo.` }

    if (tipo === 'address') {
      const campos = {}
      let algum = false
      for (const c of CAMPOS_ENDERECO) {
        campos[c] = texto(bruto?.[c])
        if (campos[c]) algum = true
      }
      // Rótulo sem nenhum campo é uma linha que não diz nada.
      if (!algum) return { error: `Endereço "${label}" está vazio.` }
      itens.push({ label, ...campos, is_primary: Boolean(bruto?.is_primary), position: itens.length })
    } else {
      const value = texto(bruto?.value)
      if (!value) return { error: `O ${nome.singular} "${label}" está vazio.` }
      itens.push({ label, value, is_primary: Boolean(bruto?.is_primary), position: itens.length })
    }
  }

  const principais = itens.filter((i) => i.is_primary)
  if (principais.length > 1) {
    return { error: `Marque apenas ${nome.artigo} como principal.` }
  }
  // Ninguém marcou: promove o primeiro. A listagem precisa de um principal, e
  // fazer o usuário escolher quando só existe uma opção óbvia é atrito à toa.
  if (principais.length === 0) itens[0].is_primary = true

  return { itens }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd src && npx vitest run tests/unit/personContacts.test.js
```

Expected: PASS, 12 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/personContacts.js src/tests/unit/personContacts.test.js
git commit -m "feat(api): regra de contatos múltiplos e principal em lib pura"
```

---

### Task 6: API de clientes — ficha completa e escrita em transação

**Files:**
- Modify: `src/routes/clients.js`
- Test: `src/tests/integration/clientsContacts.test.js`

**Interfaces:**
- Consumes: `normalizarContatos` da Task 5; tabelas das Tasks 1–3.
- Produces:
  - `GET /admin/clients` — cada item ganha `primary_phone`, `primary_email`, `primary_address`.
  - `GET /admin/clients/:id` — **novo**: `phones[]`, `emails[]`, `addresses[]`, `links[]`.
  - `POST`/`PUT /admin/clients` — aceitam `phones`, `emails`, `addresses`, `links` aninhados.

- [ ] **Step 1: Write the failing test**

Create `src/tests/integration/clientsContacts.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin } from '../helpers/factories.js'

describe('API de clientes — contatos múltiplos e PF/PJ', () => {
  let admin, emp
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    emp = await makeUser({ role: 'employee' })
  })

  it('cria cliente com dois telefones e define o principal', async () => {
    const res = await asUser(admin).post('/admin/clients').send({
      name: 'Fulano',
      phones: [
        { label: 'celular', value: '11999990000', is_primary: true },
        { label: 'comercial', value: '1133330000' },
      ],
    })
    expect(res.status).toBe(201)

    const ficha = await asUser(admin).get(`/admin/clients/${res.body.id}`)
    expect(ficha.status).toBe(200)
    expect(ficha.body.phones).toHaveLength(2)
    expect(ficha.body.phones.find((p) => p.is_primary).label).toBe('celular')
  })

  it('promove o primeiro telefone quando nenhum é marcado', async () => {
    const res = await asUser(admin).post('/admin/clients').send({
      name: 'Fulano',
      phones: [{ label: 'celular', value: '1' }, { label: 'comercial', value: '2' }],
    })
    const ficha = await asUser(admin).get(`/admin/clients/${res.body.id}`)
    expect(ficha.body.phones[0].is_primary).toBe(true)
  })

  it('recusa dois principais com mensagem legível', async () => {
    const res = await asUser(admin).post('/admin/clients').send({
      name: 'Fulano',
      phones: [
        { label: 'celular', value: '1', is_primary: true },
        { label: 'comercial', value: '2', is_primary: true },
      ],
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/apenas um telefone/i)
    // Nada foi gravado: a validação acontece ANTES de abrir a transação.
    const { rows } = await query(`SELECT count(*)::int AS c FROM clients`)
    expect(rows[0].c).toBe(0)
  })

  it('a listagem traz o contato principal, não a lista inteira', async () => {
    await asUser(admin).post('/admin/clients').send({
      name: 'Fulano',
      phones: [{ label: 'celular', value: '11999990000', is_primary: true },
               { label: 'comercial', value: '1133330000' }],
      emails: [{ label: 'pessoal', value: 'a@b.c' }],
    })
    const lista = await asUser(admin).get('/admin/clients')
    const item = lista.body.find((c) => c.name === 'Fulano')
    expect(item.primary_phone).toBe('11999990000')
    expect(item.primary_email).toBe('a@b.c')
    expect(item.phones).toBeUndefined()
  })

  it('PUT substitui as listas inteiras, em transação', async () => {
    const criado = await asUser(admin).post('/admin/clients').send({
      name: 'Fulano',
      phones: [{ label: 'celular', value: '1' }, { label: 'comercial', value: '2' }],
    })
    await asUser(admin).put(`/admin/clients/${criado.body.id}`).send({
      name: 'Fulano',
      phones: [{ label: 'WhatsApp', value: '3' }],
    })
    const ficha = await asUser(admin).get(`/admin/clients/${criado.body.id}`)
    expect(ficha.body.phones).toHaveLength(1)
    expect(ficha.body.phones[0].label).toBe('WhatsApp')
  })

  // Um PUT que falha no meio não pode deixar o cliente sem telefone nenhum.
  it('PUT inválido não apaga os contatos que já existiam', async () => {
    const criado = await asUser(admin).post('/admin/clients').send({
      name: 'Fulano',
      phones: [{ label: 'celular', value: '1' }],
    })
    const res = await asUser(admin).put(`/admin/clients/${criado.body.id}`).send({
      name: 'Fulano',
      phones: [{ label: '', value: '9' }],
    })
    expect(res.status).toBe(400)
    const ficha = await asUser(admin).get(`/admin/clients/${criado.body.id}`)
    expect(ficha.body.phones).toHaveLength(1)
    expect(ficha.body.phones[0].value).toBe('1')
  })

  it('cria PJ e o nome de exibição vem do nome fantasia', async () => {
    const res = await asUser(admin).post('/admin/clients').send({
      person_type: 'pj',
      razao_social: 'Construtora Alfa Ltda',
      nome_fantasia: 'Alfa',
      cnpj: '11.111.111/0001-11',
    })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Alfa')
  })

  it('PJ sem nome fantasia usa a razão social como nome', async () => {
    const res = await asUser(admin).post('/admin/clients').send({
      person_type: 'pj',
      razao_social: 'Construtora Beta Ltda',
    })
    expect(res.body.name).toBe('Construtora Beta Ltda')
  })

  it('PJ sem razão social é recusada com mensagem, não com erro de constraint', async () => {
    const res = await asUser(admin).post('/admin/clients').send({ person_type: 'pj', nome_fantasia: 'Gama' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/razão social/i)
  })

  it('vincula PF a PJ e a ficha da empresa mostra os dois papéis', async () => {
    const socio = await asUser(admin).post('/admin/clients').send({ name: 'João Sócio' })
    const fin = await asUser(admin).post('/admin/clients').send({ name: 'Maria Financeiro' })
    const empresa = await asUser(admin).post('/admin/clients').send({
      person_type: 'pj',
      razao_social: 'Construtora X Ltda',
      nome_fantasia: 'Construtora X',
      links: [
        { member_client_id: socio.body.id, role: 'socio' },
        { member_client_id: fin.body.id, role: 'financeiro' },
      ],
    })
    const ficha = await asUser(admin).get(`/admin/clients/${empresa.body.id}`)
    expect(ficha.body.links).toHaveLength(2)
    expect(ficha.body.links.map((l) => l.role).sort()).toEqual(['financeiro', 'socio'])
    expect(ficha.body.links.map((l) => l.member_name)).toContain('João Sócio')
  })

  it('colaborador não vê a ficha de cliente restrito', async () => {
    const criado = await asUser(admin).post('/admin/clients').send({ name: 'Sigiloso', admin_only: true })
    const res = await asUser(emp).get(`/admin/clients/${criado.body.id}`)
    expect(res.status).toBe(404)
  })

  it('colaborador não pode criar cliente', async () => {
    const res = await asUser(emp).post('/admin/clients').send({ name: 'Novo' })
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/clientsContacts.test.js
```

Expected: FAIL — a ficha por id devolve 404 (rota não existe) e `phones` é ignorado.

- [ ] **Step 3: Implementar em `src/routes/clients.js`**

Acrescente aos imports:

```js
import { withTransaction } from '../lib/db.js'
import { normalizarContatos } from '../lib/personContacts.js'
```

**a)** Substitua `parseClientPayload` por uma versão que entende PF/PJ e as listas:

```js
const PAPEIS_VINCULO = new Set(['socio', 'responsavel_tecnico', 'contato_principal', 'financeiro'])

function parseClientPayload(body = {}) {
  const personType = body.person_type === 'pj' ? 'pj' : 'pf'

  // Para PJ o nome de exibição é derivado; para PF é digitado. `name` continua
  // sendo a coluna que projetos, agente e telas leem — ver o comentário da 040.
  let name
  if (personType === 'pj') {
    const razao = optionalText(body.razao_social)
    if (!razao) return { error: 'Razão social é obrigatória para pessoa jurídica.' }
    name = optionalText(body.nome_fantasia) || razao
  } else {
    name = optionalText(body.name)
    if (!name) return { error: 'Nome é obrigatório.' }
  }

  const phones = normalizarContatos(body.phones, { tipo: 'phone' })
  if (phones.error) return { error: phones.error }
  const emails = normalizarContatos(body.emails, { tipo: 'email' })
  if (emails.error) return { error: emails.error }
  const addresses = normalizarContatos(body.addresses, { tipo: 'address' })
  if (addresses.error) return { error: addresses.error }

  const links = []
  for (const l of Array.isArray(body.links) ? body.links : []) {
    if (!l?.member_client_id) return { error: 'Todo vínculo precisa apontar para uma pessoa cadastrada.' }
    if (!PAPEIS_VINCULO.has(l.role)) return { error: `Papel de vínculo inválido: ${l.role}.` }
    links.push({ member_client_id: l.member_client_id, role: l.role })
  }

  return {
    data: {
      name,
      person_type: personType,
      notes: optionalText(body.notes),
      cpf: optionalText(body.cpf),
      rg: optionalText(body.rg),
      birth_date: optionalText(body.birth_date),
      razao_social: optionalText(body.razao_social),
      nome_fantasia: optionalText(body.nome_fantasia),
      cnpj: optionalText(body.cnpj),
      inscricao_estadual: optionalText(body.inscricao_estadual),
      founded_date: optionalText(body.founded_date),
      bank_name: optionalText(body.bank_name),
      bank_agency: optionalText(body.bank_agency),
      bank_account: optionalText(body.bank_account),
      bank_account_type: optionalText(body.bank_account_type),
      pix_key: optionalText(body.pix_key),
    },
    phones: phones.itens,
    emails: emails.itens,
    addresses: addresses.itens,
    links,
  }
}
```

Note que `email`, `phone` e `address` **saíram** do payload: as colunas antigas param de ser escritas (mas continuam lá, populadas pelo backfill).

**b)** Um helper para gravar as filhas, usado por `POST` e `PUT`:

```js
// Substituição total dentro de UMA transação: é como um formulário salva.
// Diff por id multiplicaria endpoints e estados de erro para um cadastro que
// uma pessoa edita de cada vez.
async function gravarFilhas(client, clientId, { phones, emails, addresses, links }) {
  await client.query('DELETE FROM person_phones    WHERE client_id = $1', [clientId])
  await client.query('DELETE FROM person_emails    WHERE client_id = $1', [clientId])
  await client.query('DELETE FROM person_addresses WHERE client_id = $1', [clientId])
  await client.query('DELETE FROM person_links     WHERE company_client_id = $1', [clientId])

  for (const p of phones) {
    await client.query(
      `INSERT INTO person_phones (client_id, label, value, is_primary, position)
       VALUES ($1,$2,$3,$4,$5)`,
      [clientId, p.label, p.value, p.is_primary, p.position])
  }
  for (const e of emails) {
    await client.query(
      `INSERT INTO person_emails (client_id, label, value, is_primary, position)
       VALUES ($1,$2,$3,$4,$5)`,
      [clientId, e.label, e.value, e.is_primary, e.position])
  }
  for (const a of addresses) {
    await client.query(
      `INSERT INTO person_addresses
         (client_id, label, cep, street, number, complement, district, city, uf, is_primary, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [clientId, a.label, a.cep, a.street, a.number, a.complement, a.district, a.city, a.uf, a.is_primary, a.position])
  }
  for (const l of links) {
    await client.query(
      `INSERT INTO person_links (company_client_id, member_client_id, role) VALUES ($1,$2,$3)`,
      [clientId, l.member_client_id, l.role])
  }
}
```

**c)** `GET /admin/clients` — troque o `SELECT` para trazer os principais:

```js
    let sql = `SELECT c.id, c.name, c.person_type, c.notes, c.cpf, c.rg, c.birth_date,
                      c.razao_social, c.nome_fantasia, c.cnpj, c.inscricao_estadual, c.founded_date,
                      c.admin_only, c.created_at, c.updated_at,
                      COALESCE(ac.attachment_count, 0)::int AS attachment_count,
                      pp.value AS primary_phone,
                      pe.value AS primary_email,
                      pa.street AS primary_address
               FROM clients c
               LEFT JOIN LATERAL (
                 SELECT COUNT(*)::int AS attachment_count
                 FROM client_attachments a WHERE a.client_id = c.id
               ) ac ON true
               LEFT JOIN LATERAL (
                 SELECT value FROM person_phones WHERE client_id = c.id AND is_primary LIMIT 1
               ) pp ON true
               LEFT JOIN LATERAL (
                 SELECT value FROM person_emails WHERE client_id = c.id AND is_primary LIMIT 1
               ) pe ON true
               LEFT JOIN LATERAL (
                 SELECT street FROM person_addresses WHERE client_id = c.id AND is_primary LIMIT 1
               ) pa ON true`
```

**d)** A ficha por id, nova, logo depois do `GET /admin/clients`:

```js
// Ficha completa. A listagem traz só os principais (é listagem); aqui vêm as
// listas inteiras, que é o que o formulário de edição precisa.
router.get('/admin/clients/:id', requireAuth, requireCanViewClients, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM clients WHERE id = $1`, [req.params.id])
    const cliente = rows[0]
    // Restrito só aparece para admin — mesmo 404 do resto da rota, para não
    // revelar a existência do cadastro pela diferença entre 403 e 404.
    if (!cliente || (cliente.admin_only && !isAdmin(req.profile))) {
      return res.status(404).json({ error: 'Cliente não encontrado.' })
    }

    const [{ rows: phones }, { rows: emails }, { rows: addresses }, { rows: links }] = await Promise.all([
      query(`SELECT id, label, value, is_primary, position FROM person_phones
              WHERE client_id = $1 ORDER BY position, created_at`, [req.params.id]),
      query(`SELECT id, label, value, is_primary, position FROM person_emails
              WHERE client_id = $1 ORDER BY position, created_at`, [req.params.id]),
      query(`SELECT id, label, cep, street, number, complement, district, city, uf, is_primary, position
               FROM person_addresses WHERE client_id = $1 ORDER BY position, created_at`, [req.params.id]),
      query(`SELECT l.id, l.role, l.member_client_id, m.name AS member_name, m.person_type AS member_person_type
               FROM person_links l
               JOIN clients m ON m.id = l.member_client_id
              WHERE l.company_client_id = $1 ORDER BY l.role, m.name`, [req.params.id]),
    ])

    return res.json({ ...cliente, phones, emails, addresses, links })
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em GET /admin/clients/:id')
    return res.status(400).json({ error: err.message })
  }
})
```

**e)** `POST` e `PUT` passam a gravar dentro de `withTransaction`, chamando `gravarFilhas`. O `parseClientPayload` roda **antes** de abrir a transação — validação inválida não deve nem começar a escrever.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/clientsContacts.test.js
```

Expected: PASS, 12 testes.

- [ ] **Step 5: Rodar a suíte inteira**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run
```

Expected: PASS. `contactsVisibility.test.js` continua verde — o gate de `admin_only` não mudou.

- [ ] **Step 6: Commit**

```bash
git add src/routes/clients.js src/tests/integration/clientsContacts.test.js
git commit -m "feat(api): cliente com contatos múltiplos, PF/PJ e vínculos"
```

---

### Task 7: API de fornecedores — o mesmo, reusando

**Files:**
- Modify: `src/routes/suppliers.js`
- Test: `src/tests/integration/suppliersContacts.test.js`

**Interfaces:**
- Consumes: `normalizarContatos` (Task 5), o desenho da Task 6.
- Produces: as mesmas rotas em `/admin/suppliers`, com `supplier_id` no lugar de `client_id`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/integration/suppliersContacts.test.js`. Espelha a Task 6, com os casos que **importam para fornecedor** — e o `financeiro / nota fiscal`, que é o caso real do PDF:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin } from '../helpers/factories.js'

describe('API de fornecedores — contatos múltiplos e PF/PJ', () => {
  let admin, emp
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    emp = await makeUser({ role: 'employee' })
  })

  it('fornecedor PJ com e-mail comercial e de nota fiscal', async () => {
    const res = await asUser(admin).post('/admin/suppliers').send({
      person_type: 'pj',
      razao_social: 'Marcenaria Alfa Ltda',
      nome_fantasia: 'Marcenaria Alfa',
      cnpj: '22.222.222/0001-22',
      emails: [
        { label: 'comercial', value: 'vendas@alfa.com', is_primary: true },
        { label: 'financeiro / nota fiscal', value: 'nf@alfa.com' },
      ],
    })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Marcenaria Alfa')

    const ficha = await asUser(admin).get(`/admin/suppliers/${res.body.id}`)
    expect(ficha.body.emails).toHaveLength(2)
    expect(ficha.body.emails.find((e) => e.is_primary).label).toBe('comercial')
  })

  it('guarda os dados bancários do fornecedor', async () => {
    const res = await asUser(admin).post('/admin/suppliers').send({
      name: 'Zé Marceneiro',
      bank_name: 'Itaú', bank_agency: '1234', bank_account: '56789-0',
      bank_account_type: 'corrente', pix_key: 'ze@x.com',
    })
    const ficha = await asUser(admin).get(`/admin/suppliers/${res.body.id}`)
    expect(ficha.body.bank_name).toBe('Itaú')
    expect(ficha.body.pix_key).toBe('ze@x.com')
  })

  it('a listagem traz o contato principal', async () => {
    await asUser(admin).post('/admin/suppliers').send({
      name: 'Marcenaria',
      phones: [{ label: 'comercial', value: '1133330000', is_primary: true }],
    })
    const lista = await asUser(admin).get('/admin/suppliers')
    expect(lista.body.find((s) => s.name === 'Marcenaria').primary_phone).toBe('1133330000')
  })

  it('recusa dois principais', async () => {
    const res = await asUser(admin).post('/admin/suppliers').send({
      name: 'Marcenaria',
      emails: [{ label: 'a', value: 'a@b.c', is_primary: true }, { label: 'b', value: 'd@e.f', is_primary: true }],
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/apenas um e-mail/i)
  })

  it('PUT substitui as listas', async () => {
    const criado = await asUser(admin).post('/admin/suppliers').send({
      name: 'Marcenaria',
      phones: [{ label: 'comercial', value: '1' }, { label: 'celular', value: '2' }],
    })
    await asUser(admin).put(`/admin/suppliers/${criado.body.id}`).send({
      name: 'Marcenaria', phones: [{ label: 'WhatsApp', value: '3' }],
    })
    const ficha = await asUser(admin).get(`/admin/suppliers/${criado.body.id}`)
    expect(ficha.body.phones).toHaveLength(1)
  })

  it('colaborador não vê ficha de fornecedor restrito', async () => {
    const criado = await asUser(admin).post('/admin/suppliers').send({ name: 'Sigiloso', admin_only: true })
    const res = await asUser(emp).get(`/admin/suppliers/${criado.body.id}`)
    expect(res.status).toBe(404)
  })

  it('PJ sem razão social é recusada', async () => {
    const res = await asUser(admin).post('/admin/suppliers').send({ person_type: 'pj', nome_fantasia: 'X' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/razão social/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/suppliersContacts.test.js
```

Expected: FAIL.

- [ ] **Step 3: Implementar**

Repita em `src/routes/suppliers.js` exatamente o desenho da Task 6, Step 3, trocando:

| Em clientes | Em fornecedores |
|---|---|
| `clients` | `suppliers` |
| `client_id` | `supplier_id` |
| `company_client_id` / `member_client_id` | `company_supplier_id` / `member_supplier_id` |
| `client_attachments` | *(não existe — omita o `LATERAL` de anexos)* |
| `'Cliente não encontrado.'` | `'Fornecedor não encontrado.'` |

`suppliers` tem a coluna `category`, que `clients` não tem — mantenha-a no payload e no `SELECT`.

**Não extraia um módulo compartilhado agora.** As duas rotas ficam parecidas de propósito: a regra que realmente não pode divergir (principal, rótulo, validação) já está em `lib/personContacts.js`, e o resto é SQL com nomes de tabela diferentes. Abstrair SQL parametrizado por nome de tabela custaria mais legibilidade do que economiza.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/suppliersContacts.test.js
```

Expected: PASS, 7 testes.

- [ ] **Step 5: Commit**

```bash
git add src/routes/suppliers.js src/tests/integration/suppliersContacts.test.js
git commit -m "feat(api): fornecedor com contatos múltiplos, PF/PJ e dados bancários"
```

---

### Task 8: Trocar a fonte dos leitores antigos

**Files:**
- Modify: `src/routes/projects.js:62-72`
- Test: `src/tests/integration/contactsVisibility.test.js` (acrescentar)

**Interfaces:**
- Consumes: Tasks 2 e 4.
- Produces: `GET /projects` passa a ler o contato **principal** das tabelas filhas, mantendo o gate de `admin_only` de `c0d3f06`.

- [ ] **Step 1: Write the failing test**

Acrescente ao fim de `src/tests/integration/contactsVisibility.test.js`:

```js
// Depois da 043 as colunas antigas ficam CONGELADAS: continuam existindo (é o
// que torna a migração reversível) mas ninguém escreve nelas. Quem lê contato
// de cliente precisa ler a tabela filha, senão mostra dado velho para sempre.
describe('GET /projects lê o contato principal das tabelas filhas', () => {
  let emp, admin, cliente
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee', name: 'Ana' })
    admin = await makeUser({ role: 'admin', name: 'Chefe' })

    const { rows } = await query(
      `INSERT INTO clients (name, phone, email) VALUES ('Cliente', 'ANTIGO', 'antigo@x.com') RETURNING id`)
    cliente = rows[0]
    await query(
      `INSERT INTO person_phones (client_id, label, value, is_primary)
       VALUES ($1, 'celular', 'NOVO', true), ($1, 'comercial', 'SECUNDARIO', false)`, [cliente.id])
    await query(
      `INSERT INTO person_emails (client_id, label, value, is_primary)
       VALUES ($1, 'pessoal', 'novo@x.com', true)`, [cliente.id])
    await query(
      `INSERT INTO projects (name, client, client_id) VALUES ('Obra', 'Cliente', $1)`, [cliente.id])
  })

  it('devolve o principal novo, não a coluna antiga', async () => {
    const res = await asUser(admin).get('/projects')
    const obra = res.body.find((p) => p.name === 'Obra')
    expect(obra.client_phone).toBe('NOVO')
    expect(obra.client_email).toBe('novo@x.com')
  })

  it('não devolve o telefone secundário', async () => {
    const res = await asUser(admin).get('/projects')
    const obra = res.body.find((p) => p.name === 'Obra')
    expect(obra.client_phone).not.toBe('SECUNDARIO')
  })

  it('cliente sem contato nenhum devolve null, não erro', async () => {
    const { rows } = await query(`INSERT INTO clients (name) VALUES ('Mudo') RETURNING id`)
    await query(`INSERT INTO projects (name, client, client_id) VALUES ('Obra 2', 'Mudo', $1)`, [rows[0].id])
    const res = await asUser(admin).get('/projects')
    const obra = res.body.find((p) => p.name === 'Obra 2')
    expect(obra.client_phone).toBeNull()
  })

  it('o gate de admin_only continua valendo sobre a fonte nova', async () => {
    await query(`UPDATE clients SET admin_only = true WHERE id = $1`, [cliente.id])
    const res = await asUser(emp).get('/projects')
    const obra = res.body.find((p) => p.name === 'Obra')
    expect(obra.client_phone).toBeNull()
    expect(obra.client_email).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/contactsVisibility.test.js
```

Expected: FAIL — `expected 'ANTIGO' to be 'NOVO'`.

- [ ] **Step 3: Trocar a fonte no `GET /projects`**

Em `src/routes/projects.js`, o `SELECT` do `GET /projects` passa a ser:

```js
      `SELECT p.id, p.name, COALESCE(c.name, p.client) AS client, p.client_id,
              p.address, p.start_date, p.status, p.image_url, p.briefing,
              CASE WHEN $1 OR NOT c.admin_only THEN pp.value  END AS client_phone,
              CASE WHEN $1 OR NOT c.admin_only THEN pe.value  END AS client_email,
              CASE WHEN $1 OR NOT c.admin_only THEN pa.street END AS client_address,
              p.created_at, p.updated_at
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN LATERAL (
         SELECT value FROM person_phones WHERE client_id = c.id AND is_primary LIMIT 1
       ) pp ON true
       LEFT JOIN LATERAL (
         SELECT value FROM person_emails WHERE client_id = c.id AND is_primary LIMIT 1
       ) pe ON true
       LEFT JOIN LATERAL (
         SELECT street FROM person_addresses WHERE client_id = c.id AND is_primary LIMIT 1
       ) pa ON true
       WHERE p.deleted_at IS NULL
       ORDER BY p.created_at DESC`,
```

O `CASE WHEN $1 OR NOT c.admin_only` é o gate de `c0d3f06` — **não o remova**. Ele continua correto: quando `c` é nulo (projeto sem cliente), `NOT c.admin_only` é nulo, o `CASE` cai em `NULL`, e os `LATERAL` também devolvem nulo.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/contactsVisibility.test.js
```

Expected: PASS — os testes de vazamento antigos **e** os quatro novos.

- [ ] **Step 5: Commit**

```bash
git add src/routes/projects.js src/tests/integration/contactsVisibility.test.js
git commit -m "refactor(api): GET /projects lê o contato principal das tabelas filhas"
```

---

### Task 9: Front — busca por CEP

**Files:**
- Create: `web/src/hooks/useCep.js`
- Create: `web/src/hooks/useCep.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `buscarCep(cep: string, { signal }): Promise<{ ok: true, dados } | { ok: false, motivo }>` e o hook `useCep()` → `{ buscando, erro, buscar }`.

- [ ] **Step 1: Write the failing test**

A regra que o teste tem que provar não é "preenche o endereço" — é **"nunca trava o cadastro"**. Todo caminho de falha libera o preenchimento manual.

Create `web/src/hooks/useCep.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buscarCep, apenasDigitos } from './useCep'

describe('apenasDigitos', () => {
  it('tira máscara do CEP', () => {
    expect(apenasDigitos('01310-100')).toBe('01310100')
    expect(apenasDigitos('01310 100')).toBe('01310100')
  })
})

describe('buscarCep', () => {
  beforeEach(() => { global.fetch = vi.fn() })
  afterEach(() => { vi.restoreAllMocks() })

  it('devolve os campos do ViaCEP', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        cep: '01310-100', logradouro: 'Avenida Paulista', bairro: 'Bela Vista',
        localidade: 'São Paulo', uf: 'SP',
      }),
    })
    const r = await buscarCep('01310-100')
    expect(r.ok).toBe(true)
    expect(r.dados).toEqual({
      cep: '01310-100', street: 'Avenida Paulista', district: 'Bela Vista',
      city: 'São Paulo', uf: 'SP',
    })
  })

  it('chama a URL do ViaCEP com o CEP sem máscara', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ cep: '01310-100' }) })
    await buscarCep('01310-100')
    expect(global.fetch.mock.calls[0][0]).toBe('https://viacep.com.br/ws/01310100/json/')
  })

  it('CEP inexistente ({erro:true}) NÃO é falha — libera manual', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ erro: true }) })
    const r = await buscarCep('00000000')
    expect(r.ok).toBe(false)
    expect(r.motivo).toMatch(/não encontrado/i)
  })

  it('erro de rede não estoura — devolve motivo', async () => {
    global.fetch.mockRejectedValue(new Error('offline'))
    const r = await buscarCep('01310100')
    expect(r.ok).toBe(false)
    expect(r.motivo).toBeTruthy()
  })

  it('resposta 500 não estoura', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    const r = await buscarCep('01310100')
    expect(r.ok).toBe(false)
  })

  it('CEP incompleto nem chega a chamar a rede', async () => {
    const r = await buscarCep('0131')
    expect(r.ok).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('abort não vira erro de tela', async () => {
    global.fetch.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    const r = await buscarCep('01310100')
    expect(r.ok).toBe(false)
    expect(r.abortado).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web && npx vitest run src/hooks/useCep.test.js
```

Expected: FAIL — `Failed to resolve import "./useCep"`.

- [ ] **Step 3: Implementar**

Create `web/src/hooks/useCep.js`:

```js
import { useCallback, useRef, useState } from 'react'

// Item 1 do PDF de ajustes de 18/08/2026: o CEP é o primeiro campo do endereço
// e, ao completar 8 dígitos, preenche rua, bairro, cidade e UF.
//
// Chamado DIRETO do front, sem proxy no Express: não há chave a proteger e o
// ViaCEP libera CORS. Um proxy somaria um hop de latência e um ponto de falha
// para zero ganho. Contrapartida aceita: o IP do usuário chega ao ViaCEP —
// para consulta de CEP público, irrelevante.
//
// REGRA QUE NÃO PODE QUEBRAR: nada aqui trava o cadastro. Todo caminho de falha
// devolve { ok: false } e a tela libera o preenchimento manual. O ViaCEP erra em
// loteamento novo, e um cadastro que não pode ser salvo é pior que um endereço
// digitado à mão.

const URL_BASE = 'https://viacep.com.br/ws'

export function apenasDigitos(cep) {
  return String(cep || '').replace(/\D/g, '')
}

export async function buscarCep(cep, { signal } = {}) {
  const limpo = apenasDigitos(cep)
  if (limpo.length !== 8) return { ok: false, motivo: 'CEP incompleto.' }

  try {
    const res = await fetch(`${URL_BASE}/${limpo}/json/`, { signal })
    if (!res.ok) return { ok: false, motivo: 'Não consegui consultar o CEP agora.' }
    const data = await res.json()
    // O ViaCEP responde 200 com { erro: true } para CEP inexistente.
    if (data?.erro) return { ok: false, motivo: 'CEP não encontrado. Preencha à mão.' }
    return {
      ok: true,
      dados: {
        cep: data.cep || cep,
        street: data.logradouro || null,
        district: data.bairro || null,
        city: data.localidade || null,
        uf: data.uf || null,
      },
    }
  } catch (err) {
    // Abort é o usuário continuando a digitar — não é erro para mostrar.
    if (err?.name === 'AbortError') return { ok: false, abortado: true }
    return { ok: false, motivo: 'Não consegui consultar o CEP agora.' }
  }
}

export function useCep() {
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState(null)
  const abortRef = useRef(null)

  // Cancela a busca anterior: quem digita rápido dispara várias, e sem o abort
  // a resposta de um CEP antigo poderia chegar depois e sobrescrever o novo.
  const buscar = useCallback(async (cep) => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setErro(null)
    setBuscando(true)
    const r = await buscarCep(cep, { signal: ac.signal })
    setBuscando(false)

    if (!r.ok && !r.abortado) setErro(r.motivo)
    return r
  }, [])

  return { buscando, erro, buscar }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd web && npx vitest run src/hooks/useCep.test.js
```

Expected: PASS, 8 testes.

- [ ] **Step 5: Commit**

```bash
git add web/src/hooks/useCep.js web/src/hooks/useCep.test.js
git commit -m "feat(web): busca de endereço por CEP no ViaCEP"
```

---

### Task 10: Front — campos de contato repetíveis e o formulário PF/PJ

**Files:**
- Create: `web/src/components/pessoas/ContactListField.jsx`
- Create: `web/src/components/pessoas/AddressListField.jsx`
- Create: `web/src/components/pessoas/PersonTypeToggle.jsx`
- Create: `web/src/components/pessoas/PersonLinksField.jsx`
- Create: `web/src/components/pessoas/BankFields.jsx`
- Create: `web/src/components/pessoas/labels.js`
- Create: `web/src/components/pessoas/ContactListField.test.jsx`
- Modify: `web/src/components/ClientFormModal.jsx`
- Modify: `web/src/components/SupplierFormModal.jsx`
- Modify: `web/src/pages/PessoasPage.jsx` (lista, busca, WhatsApp e card de detalhe)

**Interfaces:**
- Consumes: `useCep` da Task 9; as rotas das Tasks 6 e 7.
- Produces: componentes controlados, todos no mesmo formato — `{ itens, onChange(novosItens) }`.

- [ ] **Step 1: Escrever os rótulos sugeridos**

Create `web/src/components/pessoas/labels.js`:

```js
// Espelho de LABELS_SUGERIDOS em src/lib/personContacts.js. O banco aceita
// qualquer texto — o PDF pede lista pronta "com opção de digitar um
// personalizado" —, então isto é sugestão de UI, não validação.
// Mudou aqui, mude lá (mesmo acordo do web/src/lib/agentOpening.js).
export const LABELS = {
  phone: ['celular', 'WhatsApp', 'comercial', 'residencial', 'recado'],
  email: ['pessoal', 'comercial', 'financeiro / nota fiscal'],
  address: ['residencial', 'sede', 'obra', 'cobrança'],
}

export const PAPEIS_VINCULO = [
  { value: 'socio', label: 'Sócio' },
  { value: 'responsavel_tecnico', label: 'Responsável técnico' },
  { value: 'contato_principal', label: 'Contato principal' },
  { value: 'financeiro', label: 'Financeiro' },
]
```

- [ ] **Step 2: Write the failing test**

Create `web/src/components/pessoas/ContactListField.test.jsx`:

```jsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ContactListField } from './ContactListField'

afterEach(cleanup)

describe('ContactListField', () => {
  it('lista vazia mostra o botão de adicionar', () => {
    render(<ContactListField tipo="phone" itens={[]} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /adicionar telefone/i })).toBeTruthy()
  })

  it('adicionar cria uma linha com o primeiro rótulo sugerido', () => {
    const onChange = vi.fn()
    render(<ContactListField tipo="phone" itens={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /adicionar telefone/i }))
    expect(onChange).toHaveBeenCalledWith([
      { label: 'celular', value: '', is_primary: true },
    ])
  })

  it('a primeira linha nasce como principal', () => {
    const onChange = vi.fn()
    render(<ContactListField tipo="email" itens={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /adicionar e-mail/i }))
    expect(onChange.mock.calls[0][0][0].is_primary).toBe(true)
  })

  it('a segunda linha NÃO nasce principal', () => {
    const onChange = vi.fn()
    render(
      <ContactListField
        tipo="phone"
        itens={[{ label: 'celular', value: '1', is_primary: true }]}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /adicionar telefone/i }))
    expect(onChange.mock.calls[0][0][1].is_primary).toBe(false)
  })

  it('marcar um principal desmarca o outro', () => {
    const onChange = vi.fn()
    render(
      <ContactListField
        tipo="phone"
        itens={[
          { label: 'celular', value: '1', is_primary: true },
          { label: 'comercial', value: '2', is_primary: false },
        ]}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getAllByRole('radio')[1])
    const novos = onChange.mock.calls[0][0]
    expect(novos[0].is_primary).toBe(false)
    expect(novos[1].is_primary).toBe(true)
  })

  // Sem isto, o formulário mandaria zero principais e o servidor promoveria o
  // primeiro — o usuário veria o principal pular para outra linha sozinho.
  it('remover o principal promove o primeiro que sobrou', () => {
    const onChange = vi.fn()
    render(
      <ContactListField
        tipo="phone"
        itens={[
          { label: 'celular', value: '1', is_primary: true },
          { label: 'comercial', value: '2', is_primary: false },
        ]}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getAllByRole('button', { name: /remover/i })[0])
    const novos = onChange.mock.calls[0][0]
    expect(novos).toHaveLength(1)
    expect(novos[0].is_primary).toBe(true)
  })

  it('remover a última linha devolve lista vazia sem estourar', () => {
    const onChange = vi.fn()
    render(
      <ContactListField tipo="phone" itens={[{ label: 'celular', value: '1', is_primary: true }]} onChange={onChange} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /remover/i }))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('aceita rótulo personalizado', () => {
    const onChange = vi.fn()
    render(
      <ContactListField tipo="phone" itens={[{ label: 'celular', value: '1', is_primary: true }]} onChange={onChange} />,
    )
    fireEvent.change(screen.getByLabelText(/rótulo/i), { target: { value: 'portaria' } })
    expect(onChange.mock.calls[0][0][0].label).toBe('portaria')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd web && npx vitest run src/components/pessoas/ContactListField.test.jsx
```

Expected: FAIL — `Failed to resolve import "./ContactListField"`.

- [ ] **Step 4: Implementar o `ContactListField`**

Create `web/src/components/pessoas/ContactListField.jsx`:

```jsx
import { Plus, Trash2 } from 'lucide-react'
import { LABELS } from './labels'

const NOME = {
  phone: { singular: 'telefone', botao: 'Adicionar telefone', titulo: 'Telefones' },
  email: { singular: 'e-mail', botao: 'Adicionar e-mail', titulo: 'E-mails' },
}

// Lista repetível de telefone ou e-mail (item 2 do PDF). Componente controlado:
// não guarda estado, só devolve a lista nova. É o mesmo componente para cliente
// e fornecedor — é o que impede a regra de "principal" de divergir entre as
// duas telas.
export function ContactListField({ tipo, itens = [], onChange, readOnly = false }) {
  const nome = NOME[tipo]
  const sugestoes = LABELS[tipo] || []

  function adicionar() {
    onChange([
      ...itens,
      // A primeira linha nasce principal: a listagem precisa de um, e fazer o
      // usuário marcar quando só existe uma opção é atrito à toa.
      { label: sugestoes[0] || '', value: '', is_primary: itens.length === 0 },
    ])
  }

  function alterar(indice, campo, valor) {
    onChange(itens.map((it, i) => (i === indice ? { ...it, [campo]: valor } : it)))
  }

  function marcarPrincipal(indice) {
    onChange(itens.map((it, i) => ({ ...it, is_primary: i === indice })))
  }

  function remover(indice) {
    const restantes = itens.filter((_, i) => i !== indice)
    // Se o principal saiu, promove o primeiro que sobrou. Sem isto o formulário
    // mandaria zero principais, o servidor promoveria o primeiro, e o usuário
    // veria o principal pular de linha sozinho depois de salvar.
    if (restantes.length > 0 && !restantes.some((r) => r.is_primary)) {
      restantes[0] = { ...restantes[0], is_primary: true }
    }
    onChange(restantes)
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="block text-xs font-medium text-text-secondary">{nome.titulo}</label>
        {!readOnly && (
          <button
            type="button"
            onClick={adicionar}
            aria-label={nome.botao}
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            <Plus size={12} /> {nome.botao}
          </button>
        )}
      </div>

      {itens.length === 0 && (
        <p className="text-[11px] text-text-secondary">Nenhum {nome.singular} cadastrado.</p>
      )}

      <div className="space-y-2">
        {itens.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name={`principal-${tipo}`}
              checked={Boolean(it.is_primary)}
              onChange={() => marcarPrincipal(i)}
              disabled={readOnly}
              title="Principal (é o que aparece nas listagens)"
              aria-label={`Definir este ${nome.singular} como principal`}
            />
            <input
              list={`labels-${tipo}`}
              aria-label={`Rótulo do ${nome.singular}`}
              placeholder="Rótulo"
              value={it.label || ''}
              onChange={(e) => alterar(i, 'label', e.target.value)}
              disabled={readOnly}
              className="w-32 border border-border-subtle bg-bg px-2 py-1.5 text-sm"
            />
            <input
              aria-label={`Valor do ${nome.singular}`}
              placeholder={tipo === 'email' ? 'nome@dominio.com' : '(11) 99999-0000'}
              value={it.value || ''}
              onChange={(e) => alterar(i, 'value', e.target.value)}
              disabled={readOnly}
              className="flex-1 border border-border-subtle bg-bg px-2 py-1.5 text-sm"
            />
            {!readOnly && (
              <button
                type="button"
                onClick={() => remover(i)}
                aria-label={`Remover ${nome.singular}`}
                className="p-1 text-text-secondary hover:state-danger"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Lista pronta que não impede digitar outro — exatamente o que o PDF pede. */}
      <datalist id={`labels-${tipo}`}>
        {sugestoes.map((s) => <option key={s} value={s} />)}
      </datalist>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd web && npx vitest run src/components/pessoas/ContactListField.test.jsx
```

Expected: PASS, 8 testes.

- [ ] **Step 6: Implementar os outros quatro componentes**

Sigam o **mesmo contrato** (`{ itens, onChange }` ou `{ valor, onChange }`, controlados, sem estado próprio):

**`AddressListField.jsx`** — igual ao `ContactListField`, mas cada linha é um bloco com **o CEP como primeiro campo**, e:

```jsx
  async function aoSairDoCep(indice, cep) {
    const r = await buscar(cep)
    if (!r.ok) return // erro já está no hook; a linha continua editável
    onChange(itens.map((it, i) => (i === indice ? { ...it, ...r.dados } : it)))
  }
```

Dispare em `onChange` do CEP quando `apenasDigitos(cep).length === 8`, e também no `onBlur`. **Nunca** ponha `readOnly` nos campos preenchidos — o PDF exige que continuem editáveis. Mostre `erro` do hook como texto discreto, nunca como bloqueio.

**`PersonTypeToggle.jsx`** — dois botões (Pessoa física / Pessoa jurídica) que trocam `person_type`. Ao trocar, **não apague** os campos do outro tipo: quem clicou errado e voltou perderia o que digitou.

**`PersonLinksField.jsx`** — lista de `{ member_client_id, role }`. O seletor de pessoa é um `<select>` alimentado por `GET /admin/clients` filtrado por `person_type === 'pf'`, **nunca** um campo de texto (o PDF: "o vínculo é feito pelo cadastro existente, nunca por texto digitado"). O papel vem de `PAPEIS_VINCULO`.

**`BankFields.jsx`** — banco, agência, conta, tipo e chave PIX. Bloco simples; no bloco D ele ganha o controle de visibilidade.

- [ ] **Step 7: Recompor os dois modais**

`ClientFormModal.jsx` e `SupplierFormModal.jsx` passam a compor os blocos acima. O estado do formulário vira:

```js
const EMPTY_CLIENT_FORM = {
  person_type: 'pf',
  name: '', cpf: '', rg: '', birth_date: '',
  razao_social: '', nome_fantasia: '', cnpj: '', inscricao_estadual: '', founded_date: '',
  bank_name: '', bank_agency: '', bank_account: '', bank_account_type: '', pix_key: '',
  notes: '', admin_only: false,
  phones: [], emails: [], addresses: [], links: [],
}
```

Ao **editar**, carregue a ficha completa com `api.get('/admin/clients/' + client.id)` — a listagem só traz os principais.

- [ ] **Step 8: Migrar a tela de Pessoas para a fonte nova**

**Não pule este passo.** `PessoasPage.jsx` lê `row.phone` e `row.email` em oito
lugares, e depois da 043 essas colunas ficam **congeladas** — continuam existindo
(é o que torna o bloco reversível) mas ninguém escreve nelas. Sem este passo, a
lista, a busca e o link do WhatsApp mostrariam o telefone velho para sempre, e
ninguém perceberia: o dado está lá, só está desatualizado.

Confira o alcance antes de mexer:

```bash
grep -n "\.phone\|\.email\|whatsappLink" web/src/pages/PessoasPage.jsx
```

Troque em cada ponto:

| Onde | Hoje | Passa a ser |
|---|---|---|
| montagem das linhas (~186, 200, 214, 228) | `row.email`, `row.phone` | `row.primary_email`, `row.primary_phone` |
| filtro de busca (~253) | `p.email`, `p.phone` | os mesmos campos novos |
| link do WhatsApp (~844) | `whatsappLink(person.phone)` | `whatsappLink(person.primary_phone)` |
| card de detalhe (~889) | `person.phone` | `person.primary_phone` |

Colaboradores (`users`) **não** mudam: eles continuam com `phone` e `email`
próprios, porque a tabela `users` ficou de fora deste bloco. Se a montagem das
linhas for compartilhada entre cliente, fornecedor e colaborador, o mapeamento
precisa ser por tipo — cuidado para não trocar o campo do colaborador junto.

Na ficha do cliente, além do principal, mostre os **outros** contatos com o
rótulo de cada um: é o ganho que o item 2 pede, e sem isso o cadastro de dois
telefones não aparece em lugar nenhum.

- [ ] **Step 9: Rodar tudo**

```bash
cd web && npx vitest run
```

Expected: PASS.

- [ ] **Step 10: Conferir no navegador**

```bash
cd src && npm run dev     # terminal 1
cd web && npm run dev     # terminal 2
```

Roteiro de aceite dos itens 1, 2 e 3 do PDF:
1. Novo cliente → dois telefones (celular e comercial) → marque o comercial como principal → salve → reabra: continua o comercial.
2. Endereço → digite `01310-100` → rua, bairro, cidade e UF preenchem → **edite a rua** → salva editado.
3. Endereço → digite `99999-999` → aviso brando, campos livres, **o cadastro salva**.
4. Novo cliente **PJ** → razão social, fantasia, CNPJ → vincule duas PF (sócio e financeiro) → salve → a ficha da empresa mostra os dois.
5. Repita 1 e 4 em **fornecedor**.
6. Na **lista** de Pessoas, o telefone mostrado é o principal, e o botão do
   WhatsApp abre com ele — não com o antigo.
7. Busque pelo telefone secundário: a busca acha a pessoa.

- [ ] **Step 11: Commit**

```bash
git add web/src/components/pessoas web/src/components/ClientFormModal.jsx web/src/components/SupplierFormModal.jsx
git commit -m "feat(web): formulário de pessoa com PF/PJ, contatos múltiplos, CEP e vínculos"
```

---

### Task 11: Item 4 — admissão e desligamento do colaborador

**Files:**
- Create: `src/migrations/044_user_admission.sql`
- Modify: `src/routes/users.js`
- Modify: `web/src/pages/PessoasPage.jsx`
- Test: `src/tests/integration/userAdmission.test.js`
- Create: `web/src/lib/tempoDeCasa.js`, `web/src/lib/tempoDeCasa.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `users.admission_date`, `users.termination_date`; `tempoDeCasa(admissionDate, hoje): string | null`.

- [ ] **Step 1: Write the failing test (banco e rota)**

Create `src/tests/integration/userAdmission.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeAdmin } from '../helpers/factories.js'

describe('044 — admissão e desligamento do colaborador', () => {
  let admin
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
  })

  it('as colunas existem e começam nulas', async () => {
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, name) VALUES ('a@b.c','x','Ana')
       RETURNING admission_date, termination_date`)
    expect(rows[0].admission_date).toBeNull()
    expect(rows[0].termination_date).toBeNull()
  })

  it('a criação de usuário aceita a data de admissão', async () => {
    const res = await asUser(admin).post('/admin/create-user').send({
      name: 'Ana', email: 'ana@x.com', password: 'segredo123',
      role: 'employee', hourly_rate: 100, admission_date: '2024-03-01',
    })
    expect(res.status).toBe(201)
    const { rows } = await query(`SELECT admission_date FROM users WHERE email = 'ana@x.com'`)
    expect(String(rows[0].admission_date).slice(0, 10)).toBe('2024-03-01')
  })

  it('a edição grava admissão e desligamento', async () => {
    const criado = await asUser(admin).post('/admin/create-user').send({
      name: 'Ana', email: 'ana@x.com', password: 'segredo123', role: 'employee', hourly_rate: 100,
    })
    await asUser(admin).put(`/admin/users/${criado.body.id}`).send({
      admission_date: '2024-03-01', termination_date: '2026-08-01',
    })
    const { rows } = await query(`SELECT admission_date, termination_date FROM users WHERE id = $1`, [criado.body.id])
    expect(String(rows[0].admission_date).slice(0, 10)).toBe('2024-03-01')
    expect(String(rows[0].termination_date).slice(0, 10)).toBe('2026-08-01')
  })

  it('mandar string vazia limpa a data em vez de gravar lixo', async () => {
    const criado = await asUser(admin).post('/admin/create-user').send({
      name: 'Ana', email: 'ana@x.com', password: 'segredo123', role: 'employee',
      hourly_rate: 100, admission_date: '2024-03-01',
    })
    await asUser(admin).put(`/admin/users/${criado.body.id}`).send({ admission_date: '' })
    const { rows } = await query(`SELECT admission_date FROM users WHERE id = $1`, [criado.body.id])
    expect(rows[0].admission_date).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/userAdmission.test.js
```

Expected: FAIL — `column "admission_date" does not exist`.

- [ ] **Step 3: Migration e rota**

Create `src/migrations/044_user_admission.sql`:

```sql
-- 044_user_admission.sql
-- Data de admissão e de desligamento do colaborador (item 4 do PDF de ajustes
-- de 18/08/2026). termination_date fica em branco enquanto a pessoa está ativa.
--
-- FORA DO ESCOPO de propósito: o PDF diz que a data de desligamento "é o que
-- permite depois encerrar o acesso sem apagar o histórico de horas". Isso
-- descreve uma automação FUTURA (desativar acesso na data). Aqui entra só o
-- campo — a automação é outro item, quando for pedida.
--
-- NÃO entram no SELECT do requireAuth: o userCache carrega exatamente os campos
-- de sessão que carrega hoje, e acrescentar coluna ali custaria memória em todo
-- perfil cacheado para um dado que só a ficha usa.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS admission_date   date,
  ADD COLUMN IF NOT EXISTS termination_date date;
```

Em `src/routes/users.js`, acrescente `admission_date` e `termination_date` ao `INSERT` da criação e ao bloco de `updates` da edição, no mesmo padrão de `birth_date` (string vazia vira `null`).

- [ ] **Step 4: Run test to verify it passes**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/userAdmission.test.js
```

Expected: PASS, 4 testes.

- [ ] **Step 5: Write the failing test (tempo de casa)**

Create `web/src/lib/tempoDeCasa.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { tempoDeCasa } from './tempoDeCasa'

describe('tempoDeCasa', () => {
  it('sem data de admissão devolve null', () => {
    expect(tempoDeCasa(null, '2026-08-18')).toBeNull()
  })

  it('menos de um mês conta em dias', () => {
    expect(tempoDeCasa('2026-08-01', '2026-08-18')).toBe('17 dias')
  })

  it('um dia é singular', () => {
    expect(tempoDeCasa('2026-08-17', '2026-08-18')).toBe('1 dia')
  })

  it('meses inteiros', () => {
    expect(tempoDeCasa('2026-05-18', '2026-08-18')).toBe('3 meses')
  })

  it('um mês é singular', () => {
    expect(tempoDeCasa('2026-07-18', '2026-08-18')).toBe('1 mês')
  })

  it('anos e meses', () => {
    expect(tempoDeCasa('2024-03-01', '2026-08-18')).toBe('2 anos e 5 meses')
  })

  it('ano exato não mostra "e 0 meses"', () => {
    expect(tempoDeCasa('2025-08-18', '2026-08-18')).toBe('1 ano')
  })

  it('data futura devolve null em vez de tempo negativo', () => {
    expect(tempoDeCasa('2027-01-01', '2026-08-18')).toBeNull()
  })
})
```

- [ ] **Step 6: Implementar `tempoDeCasa`**

Create `web/src/lib/tempoDeCasa.js`:

```js
// "A ficha do colaborador mostra a data de admissão e o tempo de casa" (item 4
// do PDF). Calculado, não guardado — coluna denormalizada aqui só ficaria velha.
//
// Datas puras ('YYYY-MM-DD') são partidas à mão em vez de viraram Date: o
// driver do pg e o construtor Date discordam de fuso, e é assim que uma data
// escorrega um dia (mesmo cuidado de src/lib/dates.js e lib/birthdays.js).
function partes(ymd) {
  const [a, m, d] = String(ymd || '').slice(0, 10).split('-').map(Number)
  if (!a || !m || !d) return null
  return { a, m, d }
}

export function tempoDeCasa(admissionDate, hojeYmd) {
  const ini = partes(admissionDate)
  const hoje = partes(hojeYmd) || partes(new Date().toISOString())
  if (!ini || !hoje) return null

  let meses = (hoje.a - ini.a) * 12 + (hoje.m - ini.m)
  if (hoje.d < ini.d) meses -= 1
  if (meses < 0) return null

  if (meses === 0) {
    const dias = Math.floor(
      (Date.UTC(hoje.a, hoje.m - 1, hoje.d) - Date.UTC(ini.a, ini.m - 1, ini.d)) / 86400000,
    )
    if (dias < 0) return null
    return `${dias} ${dias === 1 ? 'dia' : 'dias'}`
  }

  const anos = Math.floor(meses / 12)
  const resto = meses % 12
  if (anos === 0) return `${resto} ${resto === 1 ? 'mês' : 'meses'}`
  const parteAnos = `${anos} ${anos === 1 ? 'ano' : 'anos'}`
  if (resto === 0) return parteAnos
  return `${parteAnos} e ${resto} ${resto === 1 ? 'mês' : 'meses'}`
}
```

- [ ] **Step 7: Run test to verify it passes**

```bash
cd web && npx vitest run src/lib/tempoDeCasa.test.js
```

Expected: PASS, 8 testes.

- [ ] **Step 8: Ligar na tela**

Em `web/src/pages/PessoasPage.jsx`: acrescente `admission_date` e `termination_date` ao `EMPTY_COLLABORATOR_FORM`, aos dois `DateField` do formulário e ao `payload` de `handleSubmitColaborador`. Na ficha do colaborador, mostre:

```jsx
<DetailRow label="Admissão">
  {formatDate(raw.admission_date)}
  {tempoDeCasa(raw.admission_date) && (
    <span className="ml-2 text-text-secondary">({tempoDeCasa(raw.admission_date)} de casa)</span>
  )}
</DetailRow>
```

- [ ] **Step 9: Commit**

```bash
git add src/migrations/044_user_admission.sql src/routes/users.js src/tests/integration/userAdmission.test.js web/src/lib/tempoDeCasa.js web/src/lib/tempoDeCasa.test.js web/src/pages/PessoasPage.jsx
git commit -m "feat: data de admissão e desligamento do colaborador"
```

---

### Task 12: Item 5 — cargo separado do perfil de permissão

**Files:**
- Modify: `web/src/pages/PessoasPage.jsx:368`
- Modify: `src/routes/users.js:97`, `src/routes/users.js:207`
- Create: `web/src/lib/cargos.js`
- Test: `src/tests/integration/userPosition.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `users.position` passa a ser digitado, nunca derivado de `role`.

- [ ] **Step 1: Entender por que não é trocar uma string**

Leia antes de mexer. `position` **nunca** é digitado hoje — é escrito em **três** lugares, todos a partir de `role`:

| Arquivo | Linha | O que faz |
|---|---|---|
| `web/src/pages/PessoasPage.jsx` | 368 | front envia `position: roleLabel(form.role)` |
| `src/routes/users.js` | 97 | criação **ignora** o que o front mandou e grava `roleLabel(role)` |
| `src/routes/users.js` | 207 | edição sobrescreve `position` sempre que `role` vier |

E `roleLabel()` (`src/lib/permissions.js:93`) devolve quatro strings, uma por permissão: `admin → 'Administrador'`, `employee → 'Colaborador'`, `administrative_intern → 'Estagiário Administrativo'`, `project_manager → 'Gestor de Projetos'`.

"Colaborador" não é um cargo cadastrado — é o `return` final dessa função.

**Não troque o retorno de `roleLabel`.** Ela é usada em 8 lugares para exibir a **permissão**, incluindo `PessoasPage.jsx:1029` e `:1043`, onde aparece dentro de `<DetailRow label="Perfil">`. Mudá-la faria a ficha dizer "Perfil: Arquiteto" — a confusão que o item 5 pede para desfazer.

- [ ] **Step 2: Write the failing test**

Create `src/tests/integration/userPosition.test.js`:

```js
// Item 5 do PDF: cargo é o que a pessoa FAZ (aparece na tela); perfil de
// permissão é o que ela PODE FAZER no sistema. Hoje são o mesmo campo — o
// backend sobrescreve position com o rótulo do role.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeAdmin } from '../helpers/factories.js'

describe('cargo é campo próprio, não o rótulo da permissão', () => {
  let admin
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
  })

  it('a criação respeita o cargo enviado', async () => {
    await asUser(admin).post('/admin/create-user').send({
      name: 'Ana', email: 'ana@x.com', password: 'segredo123',
      role: 'employee', hourly_rate: 100, position: 'Arquiteto',
    })
    const { rows } = await query(`SELECT position FROM users WHERE email = 'ana@x.com'`)
    expect(rows[0].position).toBe('Arquiteto')
  })

  it('sem cargo enviado, o padrão é Arquiteto — não "Colaborador"', async () => {
    await asUser(admin).post('/admin/create-user').send({
      name: 'Bia', email: 'bia@x.com', password: 'segredo123', role: 'employee', hourly_rate: 100,
    })
    const { rows } = await query(`SELECT position FROM users WHERE email = 'bia@x.com'`)
    expect(rows[0].position).toBe('Arquiteto')
  })

  // O caso que hoje é impossível: dois cargos diferentes na mesma permissão.
  it('duas pessoas com a mesma permissão podem ter cargos diferentes', async () => {
    await asUser(admin).post('/admin/create-user').send({
      name: 'Ana', email: 'ana@x.com', password: 'segredo123',
      role: 'employee', hourly_rate: 100, position: 'Arquiteto',
    })
    await asUser(admin).post('/admin/create-user').send({
      name: 'Bia', email: 'bia@x.com', password: 'segredo123',
      role: 'employee', hourly_rate: 50, position: 'Estagiário',
    })
    const { rows } = await query(`SELECT email, position FROM users WHERE email IN ('ana@x.com','bia@x.com') ORDER BY email`)
    expect(rows.map((r) => r.position)).toEqual(['Arquiteto', 'Estagiário'])
  })

  // A regressão principal: trocar a permissão não pode reescrever o cargo.
  it('mudar a permissão NÃO sobrescreve o cargo', async () => {
    const criado = await asUser(admin).post('/admin/create-user').send({
      name: 'Ana', email: 'ana@x.com', password: 'segredo123',
      role: 'employee', hourly_rate: 100, position: 'Sócio',
    })
    await asUser(admin).put(`/admin/users/${criado.body.id}`).send({ role: 'admin' })
    const { rows } = await query(`SELECT role, position FROM users WHERE id = $1`, [criado.body.id])
    expect(rows[0].role).toBe('admin')
    expect(rows[0].position).toBe('Sócio')
  })

  it('a edição altera o cargo sem tocar na permissão', async () => {
    const criado = await asUser(admin).post('/admin/create-user').send({
      name: 'Ana', email: 'ana@x.com', password: 'segredo123',
      role: 'employee', hourly_rate: 100, position: 'Estagiário',
    })
    await asUser(admin).put(`/admin/users/${criado.body.id}`).send({ position: 'Arquiteto' })
    const { rows } = await query(`SELECT role, position FROM users WHERE id = $1`, [criado.body.id])
    expect(rows[0].role).toBe('employee')
    expect(rows[0].position).toBe('Arquiteto')
  })

  it('cargo personalizado é aceito', async () => {
    await asUser(admin).post('/admin/create-user').send({
      name: 'Ana', email: 'ana@x.com', password: 'segredo123',
      role: 'employee', hourly_rate: 100, position: 'Coordenadora de obra',
    })
    const { rows } = await query(`SELECT position FROM users WHERE email = 'ana@x.com'`)
    expect(rows[0].position).toBe('Coordenadora de obra')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/userPosition.test.js
```

Expected: FAIL — `expected 'Colaborador' to be 'Arquiteto'`.

- [ ] **Step 4: Parar de derivar `position` no backend**

Em `src/routes/users.js`:

**Linha ~97** (criação) — troque `roleLabel(role)` por `optionalText(position) || CARGO_PADRAO`, com:

```js
// Cargo é o que a pessoa FAZ; role é o que ela PODE FAZER. São campos
// separados desde o item 5 do PDF de 18/08/2026 — antes disso, position era
// gravado como roleLabel(role), e por isso todo colaborador aparecia como
// "Colaborador". Ver docs/superpowers/specs/2026-08-18-ajustes-void-b-pessoas-design.md §6.
const CARGO_PADRAO = 'Arquiteto'
```

e acrescente `position` à desestruturação do `req.body`.

**Linha ~207** (edição) — **apague** a linha `updates.position = roleLabel(role)` de dentro do `if (role !== undefined)` e trate `position` como campo independente:

```js
  if (position !== undefined) {
    updates.position = `$${paramIdx}`
    params.push(optionalText(position))
    paramIdx += 1
  }
```

Se `roleLabel` ficar sem uso no arquivo, remova-a do `import` — mas **não** a apague de `lib/permissions.js`, onde o front ainda a usa para exibir a permissão.

- [ ] **Step 5: Run test to verify it passes**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/userPosition.test.js
```

Expected: PASS, 6 testes.

- [ ] **Step 6: Campo de cargo na tela**

Create `web/src/lib/cargos.js`:

```js
// Cargos sugeridos (item 5 do PDF de 18/08/2026). Lista pronta que não impede
// digitar outro — mesmo padrão dos rótulos de contato.
// Confirmar a lista final com o cliente; até lá, estes são os quatro do PDF.
export const CARGOS = ['Arquiteto', 'Estagiário', 'Administrativo', 'Sócio']
export const CARGO_PADRAO = 'Arquiteto'
```

Em `web/src/pages/PessoasPage.jsx`:

1. `EMPTY_COLLABORATOR_FORM.position` passa de `''` para `CARGO_PADRAO`.
2. **Apague a linha 368** (`position: roleLabel(form.role),`) e ponha `position: form.position,`.
3. Acrescente ao formulário um campo de cargo com `list`/`datalist` sobre `CARGOS`, separado do select de permissão, com o rótulo **Cargo** (o de permissão continua **Perfil**).

- [ ] **Step 7: Rodar tudo**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run
cd ../web && npx vitest run
```

Expected: PASS nas duas.

- [ ] **Step 8: Commit**

```bash
git add src/routes/users.js src/tests/integration/userPosition.test.js web/src/lib/cargos.js web/src/pages/PessoasPage.jsx
git commit -m "fix: cargo deixa de ser o rótulo do perfil de permissão"
```

---

### Task 13: Aniversariantes só de pessoa física

**Files:**
- Modify: `src/routes/me.js:691` (`GET /birthdays`) e `:529` (`GET /me/team-birthdays`)
- Test: `src/tests/integration/team-birthdays.test.js` (acrescentar)

**Interfaces:**
- Consumes: `person_type` da Task 1.
- Produces: guarda de PF em todo leitor de aniversário.

- [ ] **Step 1: Entender o que está sendo feito — e o que NÃO está**

O PDF pede: *"No card de aniversariantes da tela inicial, listar apenas pessoas físicas."*

Verificado no código: `GET /birthdays` e `GET /me/team-birthdays` leem **só a tabela `users`**. Cliente nenhum aparece no card hoje, embora `clients.birth_date` exista desde a migration 019.

**Decidido em 18/08/2026:** cliente **não** entra no card. Esta tarefa implementa a **guarda** (`person_type = 'pf'`) em todo leitor que um dia venha a olhar `clients`, para PJ nunca entrar. **Não** adiciona clientes ao card — isso é funcionalidade nova, não pedida.

- [ ] **Step 2: Write the failing test**

Acrescente ao fim de `src/tests/integration/team-birthdays.test.js`:

```js
// Guarda de PF: se um dia clientes entrarem no card, pessoa jurídica não pode
// "fazer aniversário". A data de fundação de uma construtora não é aniversário
// de ninguém. Ver a decisão de 18/08/2026 no spec do bloco B, §7.
describe('aniversariantes ignoram pessoa jurídica', () => {
  beforeEach(async () => { await resetDb() })

  it('a lista continua vindo só de users', async () => {
    const u = await makeUser({ role: 'employee', name: 'Ana', birth_date: '1990-08-18' })
    await query(
      `INSERT INTO clients (name, person_type, razao_social, birth_date)
       VALUES ('Construtora X', 'pj', 'Construtora X Ltda', '1990-08-18')`)
    const res = await asUser(u).get('/birthdays')
    expect(res.status).toBe(200)
    expect(res.body.map((p) => p.name)).toContain('Ana')
    expect(res.body.map((p) => p.name)).not.toContain('Construtora X')
  })

  it('o endpoint da equipe também não traz PJ', async () => {
    const u = await makeUser({ role: 'employee', name: 'Ana', birth_date: '1990-08-18' })
    await query(
      `INSERT INTO clients (name, person_type, razao_social, birth_date)
       VALUES ('Construtora X', 'pj', 'Construtora X Ltda', '1990-08-18')`)
    const res = await asUser(u).get('/me/team-birthdays')
    expect(res.body.aniversariantes.map((p) => p.name)).not.toContain('Construtora X')
  })
})
```

- [ ] **Step 3: Rodar — deve passar já**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/team-birthdays.test.js
```

Expected: PASS **sem nenhuma mudança de código**. É de propósito: o teste trava a decisão. Se alguém acrescentar clientes ao card no futuro sem a guarda de PF, ele quebra.

- [ ] **Step 4: Documentar a guarda onde ela vai importar**

Acrescente o comentário em `src/routes/me.js`, logo acima do `GET /birthdays`:

```js
// ─── ANIVERSARIANTES (compartilhado: admin e employee) ────────────────
// Lê SÓ `users`. Decidido em 18/08/2026 que cliente não entra no card (item 3
// do PDF de ajustes). Se um dia entrar, o SELECT precisa de
// `AND person_type = 'pf'` — pessoa jurídica não faz aniversário, e a data de
// fundação de uma construtora não vai no card social do time.
// Ver docs/superpowers/specs/2026-08-18-ajustes-void-b-pessoas-design.md §7.
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/me.js src/tests/integration/team-birthdays.test.js
git commit -m "test: trava a decisão de aniversariantes não listarem pessoa jurídica"
```

---

### Task 14: Verificação final do bloco B

**Files:** `docs/superpowers/specs/2026-08-18-ajustes-void-b-pessoas-design.md`

- [ ] **Step 1: Suítes**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run
cd ../web && npx vitest run
```

Expected: PASS nas duas.

- [ ] **Step 2: Migration num banco limpo**

O que importa em produção não é o teste — é a migration subir num banco que já tem dado. Simule:

```bash
docker run -d --rm --name ots-migracao -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=office_timesheet -p 5434:5432 postgres:16-alpine
sleep 5
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5434/office_timesheet" npm run migrate
```

Expected: todas as migrations `OK`, nenhuma `FAIL`. Depois, insira um cliente no formato antigo, rode `043` na mão e confira o resultado. Ao terminar: `docker stop ots-migracao`.

- [ ] **Step 3: Roteiro de aceite do PDF**

| Item | Aceite |
|---|---|
| 1 | "Digitei o CEP e rua, bairro, cidade e UF vieram preenchidos." |
| 2 | "Cadastro dois telefones na mesma pessoa, identificados como celular e comercial, e defino o principal." |
| 3 | "Cadastro uma construtora como PJ, vinculo o sócio e o contato do financeiro, e ambos aparecem na ficha da empresa." |
| 4 | "A ficha do colaborador mostra a data de admissão e o tempo de casa." |
| 5 | "Ao criar um usuário, o cargo padrão é 'Arquiteto' e a permissão é escolhida em campo próprio." |

- [ ] **Step 4: Atualizar o spec**

Troque o `**Status:**` do cabeçalho por:

```markdown
**Status:** implementado; pendente a decisão de backfill do cargo (§6) e o DROP das colunas antigas
```

E acrescente ao fim do documento:

```markdown
## 10. O que ficou para depois

- **Backfill do cargo** (§6): decisão adiada em 18/08/2026. As pessoas
  cadastradas antes continuam com `position` derivado da permissão até alguém
  editar a ficha ou a decisão sair.
- **`DROP` das colunas antigas** (`clients.email`, `clients.phone`,
  `clients.address`, `suppliers.email`, `suppliers.phone`): migration separada,
  **só depois** de o sistema rodar em produção lendo as tabelas filhas. Elas
  seguem populadas — é o que torna todo este bloco reversível por revert de
  código, sem restore de banco.
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-08-18-ajustes-void-b-pessoas-design.md
git commit -m "docs: bloco B concluído, com o que ficou pendente"
```
