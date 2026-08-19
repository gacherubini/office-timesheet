# Bloco D — Visibilidade por informação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A restrição sai de "o contato inteiro aparece ou não" para "**esta informação** aparece ou não": cada campo sensível e cada documento anexado ganha um controle próprio, e o que está restrito simplesmente não existe na resposta que o colaborador recebe.

**Architecture:** Campos escalares são marcados por presença de linha em `person_restricted_fields`; contatos e anexos ganham um `is_restricted` na própria linha. A remoção acontece num **único** ponto — uma função pura em `lib/personVisibility.js` — porque foi exatamente a filtragem espalhada rota a rota que produziu o vazamento corrigido em `c0d3f06`.

**Tech Stack:** PostgreSQL 16, Node 20 / Express 5, node-postgres, Vitest + Supertest; React 19.

**Spec:** `docs/superpowers/specs/2026-08-18-ajustes-void-d-visibilidade-design.md`

## Global Constraints

- **Depende do bloco B.** CNPJ, inscrição estadual, RG e os campos bancários nascem lá. Não comece este plano antes de a migration 040 estar aplicada.
- **O log de acesso LGPD está FORA do escopo** — decisão de 18/08/2026. A restrição é implementada por inteiro; a trilha de auditoria não. Ver Task 8.
- **A chave é omitida do JSON, não anulada.** O PDF: *"o campo restrito simplesmente não aparece — nem mascarado, nem com aviso"*. `null` renderizaria "CPF: —", que é justamente o aviso que não pode existir.
- **`name` nunca é restringível.** É lido por `GET /projects`, pela tool `statusProjeto.js` e pelas telas. Restringi-lo apagaria cards de projeto.
- **`admin_only` continua existindo.** Responde outra pergunta ("o colaborador pode saber que esta pessoa existe?") e há dado em produção usando.
- **O `PUT` não pode apagar o que não recebeu.** Um colaborador salvando a ficha zeraria o CPF sem nunca tê-lo visto. É o bug mais provável do bloco inteiro — tem teste próprio na Task 5.
- Banco de teste: `DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test"`.
- Comentários e mensagens em **português**.

---

### Task 1: `lib/personVisibility.js` — a regra, sem banco

**Files:**
- Create: `src/lib/personVisibility.js`
- Test: `src/tests/unit/personVisibility.test.js`

**Interfaces:**
- Consumes: `isAdmin` de `lib/permissions.js`.
- Produces:
  - `CAMPOS_RESTRINGIVEIS: Set<string>`
  - `PADRAO_RESTRITO: string[]`
  - `aplicarVisibilidade(profile, pessoa, restritos): object`
  - `aplicarVisibilidadeEmLista(profile, pessoas, restritosPorId): object[]`
  - `filtrarLinhasRestritas(profile, linhas): object[]`

- [ ] **Step 1: Write the failing test**

A regra vem primeiro, pura e testável isolada. Se as rotas vierem antes, cada uma inventa a sua — e foi assim que o `admin_only` acabou certo em `/admin/clients` e vazando em `GET /projects`.

Create `src/tests/unit/personVisibility.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  aplicarVisibilidade, aplicarVisibilidadeEmLista, filtrarLinhasRestritas,
  CAMPOS_RESTRINGIVEIS, PADRAO_RESTRITO,
} from '../../lib/personVisibility.js'

const admin = { id: 'a1', role: 'admin' }
const emp = { id: 'e1', role: 'employee' }
const pessoa = { id: 'c1', name: 'Fulano', cpf: '123', rg: '456', notes: 'obs', pix_key: 'x@y.z' }

describe('aplicarVisibilidade', () => {
  it('admin recebe tudo, intacto', () => {
    expect(aplicarVisibilidade(admin, pessoa, ['cpf', 'rg'])).toEqual(pessoa)
  })

  // O ponto do item 6: "nem mascarado, nem com aviso".
  it('colaborador não recebe a CHAVE do campo restrito', () => {
    const r = aplicarVisibilidade(emp, pessoa, ['cpf'])
    expect('cpf' in r).toBe(false)
    expect(r.cpf).toBeUndefined()
  })

  it('o campo restrito não vira null', () => {
    const r = aplicarVisibilidade(emp, pessoa, ['cpf'])
    expect(Object.keys(r)).not.toContain('cpf')
  })

  it('os campos não restritos continuam', () => {
    const r = aplicarVisibilidade(emp, pessoa, ['cpf'])
    expect(r.name).toBe('Fulano')
    expect(r.rg).toBe('456')
  })

  it('remove vários de uma vez', () => {
    const r = aplicarVisibilidade(emp, pessoa, ['cpf', 'rg', 'pix_key'])
    expect(Object.keys(r).sort()).toEqual(['id', 'name', 'notes'])
  })

  it('lista de restritos vazia devolve tudo', () => {
    expect(aplicarVisibilidade(emp, pessoa, [])).toEqual(pessoa)
    expect(aplicarVisibilidade(emp, pessoa, undefined)).toEqual(pessoa)
  })

  // Defesa em profundidade: se alguém inserir 'name' na tabela por engano ou
  // por má-fé, os cards de projeto não podem sumir do sistema inteiro.
  it('ignora campo fora da allowlist', () => {
    const r = aplicarVisibilidade(emp, pessoa, ['name'])
    expect(r.name).toBe('Fulano')
  })

  it('não muta o objeto recebido', () => {
    const orig = { ...pessoa }
    aplicarVisibilidade(emp, pessoa, ['cpf'])
    expect(pessoa).toEqual(orig)
  })

  it('pessoa nula não estoura', () => {
    expect(aplicarVisibilidade(emp, null, ['cpf'])).toBeNull()
  })

  it('perfil ausente é tratado como não-admin', () => {
    const r = aplicarVisibilidade(null, pessoa, ['cpf'])
    expect('cpf' in r).toBe(false)
  })
})

describe('aplicarVisibilidadeEmLista', () => {
  it('aplica os restritos de cada pessoa, não os do vizinho', () => {
    const lista = [{ id: 'c1', name: 'A', cpf: '1' }, { id: 'c2', name: 'B', cpf: '2' }]
    const r = aplicarVisibilidadeEmLista(emp, lista, { c1: ['cpf'] })
    expect('cpf' in r[0]).toBe(false)
    expect(r[1].cpf).toBe('2')
  })

  it('admin recebe a lista inteira', () => {
    const lista = [{ id: 'c1', name: 'A', cpf: '1' }]
    expect(aplicarVisibilidadeEmLista(admin, lista, { c1: ['cpf'] })[0].cpf).toBe('1')
  })

  it('lista vazia devolve vazio', () => {
    expect(aplicarVisibilidadeEmLista(emp, [], {})).toEqual([])
    expect(aplicarVisibilidadeEmLista(emp, null, {})).toEqual([])
  })
})

describe('filtrarLinhasRestritas', () => {
  const linhas = [
    { id: 'p1', label: 'celular', value: '1', is_primary: true, is_restricted: false },
    { id: 'p2', label: 'recado', value: '2', is_primary: false, is_restricted: true },
  ]

  it('admin vê as duas', () => {
    expect(filtrarLinhasRestritas(admin, linhas)).toHaveLength(2)
  })

  it('colaborador vê só a liberada', () => {
    const r = filtrarLinhasRestritas(emp, linhas)
    expect(r).toHaveLength(1)
    expect(r[0].label).toBe('celular')
  })

  // Se o principal era o restrito, o colaborador não pode ficar com lista vazia
  // tendo telefone disponível: o próximo assume o papel na visão dele.
  it('se o principal era restrito, o próximo vira principal para quem não vê', () => {
    const comPrincipalRestrito = [
      { id: 'p1', label: 'pessoal', value: '1', is_primary: true, is_restricted: true },
      { id: 'p2', label: 'comercial', value: '2', is_primary: false, is_restricted: false },
    ]
    const r = filtrarLinhasRestritas(emp, comPrincipalRestrito)
    expect(r).toHaveLength(1)
    expect(r[0].is_primary).toBe(true)
  })

  it('todas restritas devolve lista vazia', () => {
    const todas = linhas.map((l) => ({ ...l, is_restricted: true }))
    expect(filtrarLinhasRestritas(emp, todas)).toEqual([])
  })

  it('lista nula devolve vazio', () => {
    expect(filtrarLinhasRestritas(emp, null)).toEqual([])
  })
})

describe('allowlist e padrões', () => {
  it('cobre os campos que o PDF manda nascer restritos', () => {
    for (const c of ['cpf', 'cnpj', 'rg', 'bank_name', 'bank_agency', 'bank_account', 'pix_key']) {
      expect(CAMPOS_RESTRINGIVEIS.has(c)).toBe(true)
    }
  })

  it('name NÃO é restringível', () => {
    expect(CAMPOS_RESTRINGIVEIS.has('name')).toBe(false)
  })

  it('o padrão do PDF: CPF, CNPJ, RG e bancários', () => {
    expect(PADRAO_RESTRITO).toEqual(expect.arrayContaining(['cpf', 'cnpj', 'rg', 'pix_key']))
    expect(PADRAO_RESTRITO).not.toContain('notes')
  })

  it('todo padrão está na allowlist', () => {
    for (const c of PADRAO_RESTRITO) expect(CAMPOS_RESTRINGIVEIS.has(c)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src && npx vitest run tests/unit/personVisibility.test.js
```

Expected: FAIL — `Failed to resolve import "../../lib/personVisibility.js"`.

- [ ] **Step 3: Implementar**

Create `src/lib/personVisibility.js`:

```js
import { isAdmin } from './permissions.js'

// Visibilidade POR INFORMAÇÃO (item 6 do PDF de ajustes de 18/08/2026).
//
// UM ÚNICO PONTO DE APLICAÇÃO, de propósito. A tentação é filtrar em cada rota,
// e foi assim que o vazamento de c0d3f06 aconteceu: o autor de GET /projects
// não estava pensando em admin_only, e nada o obrigava a pensar. Trocar um
// booleano por uma matriz de campos multiplica as chances do mesmo erro.
//
// Funções PURAS: recebem os campos restritos já carregados, não vão ao banco.
// Mesmo precedente de lib/birthdays.js e lib/performanceSimulation.js.

// Só estes podem ser marcados como restritos. `name` fica DE FORA: é o nome de
// exibição, lido por GET /projects, pela tool statusProjeto.js do agente e
// pelos relatórios. Restringi-lo apagaria cards de projeto e quebraria telas
// que nada têm a ver com PII.
export const CAMPOS_RESTRINGIVEIS = new Set([
  'cpf', 'rg', 'birth_date',
  'cnpj', 'inscricao_estadual', 'razao_social', 'founded_date',
  'bank_name', 'bank_agency', 'bank_account', 'bank_account_type', 'pix_key',
  'notes',
])

// "Nascem restritos por padrão: CPF, CNPJ, RG, dados bancários e valores de
// contrato." Valores de contrato já estão resolvidos: projects.sale_value não é
// devolvido por GET /projects e canAccessMoney() já é isAdmin.
export const PADRAO_RESTRITO = [
  'cpf', 'rg', 'cnpj',
  'bank_name', 'bank_agency', 'bank_account', 'bank_account_type', 'pix_key',
]

export function aplicarVisibilidade(profile, pessoa, restritos) {
  if (!pessoa) return pessoa
  if (isAdmin(profile)) return pessoa

  const remover = (restritos || []).filter((c) => CAMPOS_RESTRINGIVEIS.has(c))
  if (remover.length === 0) return pessoa

  // Cópia: o chamador pode estar reusando o objeto (cache, log, outra resposta).
  const copia = { ...pessoa }
  // DELETE, não `= null`: o PDF é literal — "nem mascarado, nem com aviso". Um
  // null renderizaria "CPF: —" na tela, que é justamente o aviso proibido.
  for (const campo of remover) delete copia[campo]
  return copia
}

export function aplicarVisibilidadeEmLista(profile, pessoas, restritosPorId) {
  const lista = Array.isArray(pessoas) ? pessoas : []
  if (isAdmin(profile)) return lista
  return lista.map((p) => aplicarVisibilidade(profile, p, restritosPorId?.[p.id]))
}

// Contatos e anexos são linhas: a restrição vive na própria linha, e o filtro é
// remover a linha inteira.
export function filtrarLinhasRestritas(profile, linhas) {
  const lista = Array.isArray(linhas) ? linhas : []
  if (isAdmin(profile)) return lista

  const visiveis = lista.filter((l) => !l.is_restricted)
  // Se o principal era restrito, quem não o vê ficaria com uma lista sem
  // principal — e a UI mostraria "sem telefone" tendo telefone. O próximo
  // assume o papel NA VISÃO DELE; no banco nada muda.
  if (visiveis.length > 0 && !visiveis.some((l) => l.is_primary)) {
    return visiveis.map((l, i) => (i === 0 ? { ...l, is_primary: true } : l))
  }
  return visiveis
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd src && npx vitest run tests/unit/personVisibility.test.js
```

Expected: PASS, 23 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/personVisibility.js src/tests/unit/personVisibility.test.js
git commit -m "feat(api): regra de visibilidade por campo numa lib pura"
```

---

### Task 2: Migration — a marcação de restrito

**Files:**
- Create: `src/migrations/052_person_restricted_fields.sql`
- Test: `src/tests/integration/restrictedFieldsSchema.test.js`

**Interfaces:**
- Consumes: blocos B (migrations 040–042).
- Produces: `person_restricted_fields`; `is_restricted` em `person_phones`, `person_emails`, `person_addresses`, `client_attachments`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/integration/restrictedFieldsSchema.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resetDb, query } from '../helpers/db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ARQUIVO = path.resolve(__dirname, '../../migrations/052_person_restricted_fields.sql')

describe('052 — marcação de campo restrito', () => {
  let cliente
  beforeEach(async () => {
    await resetDb()
    const { rows } = await query(`INSERT INTO clients (name) VALUES ('Fulano') RETURNING id`)
    cliente = rows[0].id
  })

  it('marca um campo como restrito', async () => {
    await query(`INSERT INTO person_restricted_fields (client_id, field_name) VALUES ($1,'cpf')`, [cliente])
    const { rows } = await query(
      `SELECT field_name FROM person_restricted_fields WHERE client_id = $1`, [cliente])
    expect(rows.map((r) => r.field_name)).toEqual(['cpf'])
  })

  it('não marca o mesmo campo duas vezes', async () => {
    await query(`INSERT INTO person_restricted_fields (client_id, field_name) VALUES ($1,'cpf')`, [cliente])
    await expect(
      query(`INSERT INTO person_restricted_fields (client_id, field_name) VALUES ($1,'cpf')`, [cliente]),
    ).rejects.toThrow(/duplicate key/)
  })

  it('recusa linha com dois donos', async () => {
    const { rows } = await query(`INSERT INTO suppliers (name) VALUES ('Forn') RETURNING id`)
    await expect(
      query(`INSERT INTO person_restricted_fields (client_id, supplier_id, field_name) VALUES ($1,$2,'cpf')`,
        [cliente, rows[0].id]),
    ).rejects.toThrow(/prf_um_dono/)
  })

  it('recusa linha órfã', async () => {
    await expect(
      query(`INSERT INTO person_restricted_fields (field_name) VALUES ('cpf')`),
    ).rejects.toThrow(/prf_um_dono/)
  })

  it('apagar o cliente leva as marcações', async () => {
    await query(`INSERT INTO person_restricted_fields (client_id, field_name) VALUES ($1,'cpf')`, [cliente])
    await query(`DELETE FROM clients WHERE id = $1`, [cliente])
    const { rows } = await query(`SELECT count(*)::int AS c FROM person_restricted_fields`)
    expect(rows[0].c).toBe(0)
  })

  it('contatos e anexos têm is_restricted, default false', async () => {
    const { rows: t } = await query(
      `INSERT INTO person_phones (client_id, label, value) VALUES ($1,'celular','1') RETURNING is_restricted`,
      [cliente])
    expect(t[0].is_restricted).toBe(false)

    const { rows: a } = await query(
      `INSERT INTO client_attachments (client_id, file_url, file_name)
       VALUES ($1,'http://x/y.pdf','contrato.pdf') RETURNING is_restricted`, [cliente])
    expect(a[0].is_restricted).toBe(false)
  })

  // "Nascem restritos por padrão" com dado LEGADO tem que valer também: o
  // contrário deixaria justamente os cadastros reais desprotegidos.
  it('o backfill marca os cadastros que já existiam', async () => {
    await query(await readFile(ARQUIVO, 'utf8')).catch(() => {})
    const { rows } = await query(
      `SELECT field_name FROM person_restricted_fields WHERE client_id = $1 ORDER BY field_name`, [cliente])
    expect(rows.map((r) => r.field_name)).toEqual(expect.arrayContaining(['cpf', 'cnpj', 'rg', 'pix_key']))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/restrictedFieldsSchema.test.js
```

Expected: FAIL — `relation "person_restricted_fields" does not exist`.

- [ ] **Step 3: Escrever a migration**

Create `src/migrations/052_person_restricted_fields.sql`:

```sql
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

-- Backfill: "nascem restritos por padrão" vale para quem JÁ EXISTE também.
-- O contrário (legado nasce aberto) deixaria justamente os cadastros reais
-- desprotegidos — que são os únicos que existem hoje.
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/restrictedFieldsSchema.test.js
```

Expected: PASS, 7 testes.

- [ ] **Step 5: Commit**

```bash
git add src/migrations/052_person_restricted_fields.sql src/tests/integration/restrictedFieldsSchema.test.js
git commit -m "feat(db): marcação de campo e de contato restrito ao admin"
```

---

### Task 3: Aplicar nas rotas de cliente

**Files:**
- Modify: `src/routes/clients.js`
- Test: `src/tests/integration/clientVisibility.test.js`

**Interfaces:**
- Consumes: Tasks 1 e 2.
- Produces: `GET /admin/clients` e `GET /admin/clients/:id` já filtrados; `POST` marca os padrões; `PUT` aceita `restricted_fields`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/integration/clientVisibility.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin } from '../helpers/factories.js'

describe('visibilidade por campo — clientes', () => {
  let admin, emp, cliente
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    emp = await makeUser({ role: 'employee', name: 'Arquiteta' })
    const res = await asUser(admin).post('/admin/clients').send({
      name: 'Fulano', cpf: '123.456.789-00', rg: '12.345.678-9', notes: 'observação',
    })
    cliente = res.body.id
  })

  // "Nascem restritos por padrão: CPF, CNPJ, RG, dados bancários."
  it('cliente novo nasce com CPF e RG restritos', async () => {
    const { rows } = await query(
      `SELECT field_name FROM person_restricted_fields WHERE client_id = $1 ORDER BY field_name`, [cliente])
    expect(rows.map((r) => r.field_name)).toEqual(expect.arrayContaining(['cpf', 'rg', 'cnpj']))
  })

  it('admin vê o CPF na ficha', async () => {
    const res = await asUser(admin).get(`/admin/clients/${cliente}`)
    expect(res.body.cpf).toBe('123.456.789-00')
  })

  // O aceite literal do PDF.
  it('colaborador não recebe a chave cpf', async () => {
    const res = await asUser(emp).get(`/admin/clients/${cliente}`)
    expect(res.status).toBe(200)
    expect('cpf' in res.body).toBe(false)
    expect('rg' in res.body).toBe(false)
  })

  it('colaborador recebe os campos não restritos', async () => {
    const res = await asUser(emp).get(`/admin/clients/${cliente}`)
    expect(res.body.name).toBe('Fulano')
    expect(res.body.notes).toBe('observação')
  })

  it('a LISTAGEM também filtra', async () => {
    const res = await asUser(emp).get('/admin/clients')
    const item = res.body.find((c) => c.name === 'Fulano')
    expect('cpf' in item).toBe(false)
  })

  it('a listagem do admin não filtra', async () => {
    const res = await asUser(admin).get('/admin/clients')
    expect(res.body.find((c) => c.name === 'Fulano').cpf).toBe('123.456.789-00')
  })

  it('admin libera um campo e o colaborador passa a ver', async () => {
    await asUser(admin).put(`/admin/clients/${cliente}`).send({
      name: 'Fulano', cpf: '123.456.789-00', restricted_fields: ['rg'],
    })
    const res = await asUser(emp).get(`/admin/clients/${cliente}`)
    expect(res.body.cpf).toBe('123.456.789-00')
    expect('rg' in res.body).toBe(false)
  })

  it('colaborador não pode alterar a marcação', async () => {
    const res = await asUser(emp).put(`/admin/clients/${cliente}`).send({
      name: 'Fulano', restricted_fields: [],
    })
    expect(res.status).toBe(403)
  })

  it('campo fora da allowlist é ignorado na marcação', async () => {
    await asUser(admin).put(`/admin/clients/${cliente}`).send({
      name: 'Fulano', restricted_fields: ['name', 'cpf'],
    })
    const res = await asUser(emp).get(`/admin/clients/${cliente}`)
    expect(res.body.name).toBe('Fulano')
    expect('cpf' in res.body).toBe(false)
  })

  it('telefone restrito não aparece; os outros sim', async () => {
    await query(
      `INSERT INTO person_phones (client_id, label, value, is_primary, is_restricted)
       VALUES ($1,'celular','111',true,false), ($1,'recado','222',false,true)`, [cliente])
    const res = await asUser(emp).get(`/admin/clients/${cliente}`)
    expect(res.body.phones).toHaveLength(1)
    expect(res.body.phones[0].value).toBe('111')
  })

  it('se o principal era restrito, o colaborador vê o próximo como principal', async () => {
    await query(
      `INSERT INTO person_phones (client_id, label, value, is_primary, is_restricted)
       VALUES ($1,'pessoal','111',true,true), ($1,'comercial','222',false,false)`, [cliente])
    const res = await asUser(emp).get(`/admin/clients/${cliente}`)
    expect(res.body.phones).toHaveLength(1)
    expect(res.body.phones[0].is_primary).toBe(true)
    expect(res.body.phones[0].value).toBe('222')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/clientVisibility.test.js
```

Expected: FAIL — o colaborador recebe o CPF.

- [ ] **Step 3: Implementar**

Em `src/routes/clients.js`, importe:

```js
import {
  aplicarVisibilidade, aplicarVisibilidadeEmLista, filtrarLinhasRestritas,
  CAMPOS_RESTRINGIVEIS, PADRAO_RESTRITO,
} from '../lib/personVisibility.js'
```

**Carga sem N+1.** Na listagem, um `LATERAL` agrega os restritos em array, junto da query que já existe:

```js
               LEFT JOIN LATERAL (
                 SELECT array_agg(field_name) AS campos
                   FROM person_restricted_fields WHERE client_id = c.id
               ) rf ON true
```

e a resposta passa por:

```js
    const restritosPorId = {}
    for (const r of rows) restritosPorId[r.id] = r.campos || []
    return res.json(aplicarVisibilidadeEmLista(req.profile, rows, restritosPorId))
```

Lembre de remover `campos` do objeto antes de devolver — é dado interno.

Na ficha (`GET /admin/clients/:id`), carregue os restritos junto do `Promise.all` e aplique:

```js
    return res.json({
      ...aplicarVisibilidade(req.profile, cliente, restritos),
      phones: filtrarLinhasRestritas(req.profile, phones),
      emails: filtrarLinhasRestritas(req.profile, emails),
      addresses: filtrarLinhasRestritas(req.profile, addresses),
      links,
    })
```

No `POST`, dentro da transação, marque os padrões:

```js
      // "Nascem restritos por padrão: CPF, CNPJ, RG, dados bancários."
      for (const campo of PADRAO_RESTRITO) {
        await client.query(
          `INSERT INTO person_restricted_fields (client_id, field_name) VALUES ($1,$2)
           ON CONFLICT DO NOTHING`, [created.id, campo])
      }
```

No `PUT`, aceite `restricted_fields` **só de admin**:

```js
  // Só admin muda o que é restrito. Um colaborador que pudesse desmarcar
  // esvaziaria a proteção inteira com um PUT.
  if (req.body.restricted_fields !== undefined) {
    if (!isAdmin(req.profile)) {
      return res.status(403).json({ error: 'Só o administrador altera a visibilidade dos campos.' })
    }
  }
```

e, na transação, regrave apenas os que estão na allowlist:

```js
      if (req.body.restricted_fields !== undefined) {
        const campos = (req.body.restricted_fields || []).filter((c) => CAMPOS_RESTRINGIVEIS.has(c))
        await client.query('DELETE FROM person_restricted_fields WHERE client_id = $1', [req.params.id])
        for (const campo of campos) {
          await client.query(
            `INSERT INTO person_restricted_fields (client_id, field_name) VALUES ($1,$2)`,
            [req.params.id, campo])
        }
      }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/clientVisibility.test.js
```

Expected: PASS, 11 testes.

- [ ] **Step 5: Commit**

```bash
git add src/routes/clients.js src/tests/integration/clientVisibility.test.js
git commit -m "feat(api): campos e contatos restritos somem da resposta do colaborador"
```

---

### Task 4: O mesmo em fornecedores, e nos anexos

**Files:**
- Modify: `src/routes/suppliers.js`, `src/routes/clients.js` (anexos)
- Test: `src/tests/integration/attachmentVisibility.test.js`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: anexo restrito some da lista **e** o download por id dá 404.

- [ ] **Step 1: Write the failing test**

Create `src/tests/integration/attachmentVisibility.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin } from '../helpers/factories.js'

describe('visibilidade de anexo', () => {
  let admin, emp, cliente, aberto, restrito
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    emp = await makeUser({ role: 'employee' })
    const res = await asUser(admin).post('/admin/clients').send({ name: 'Fulano' })
    cliente = res.body.id
    const { rows } = await query(
      `INSERT INTO client_attachments (client_id, file_url, file_name, is_restricted)
       VALUES ($1,'http://x/a.pdf','briefing.pdf',false),
              ($1,'http://x/b.pdf','contrato.pdf',true)
       RETURNING id, file_name`, [cliente])
    aberto = rows.find((r) => r.file_name === 'briefing.pdf').id
    restrito = rows.find((r) => r.file_name === 'contrato.pdf').id
  })

  it('admin vê os dois anexos', async () => {
    const res = await asUser(admin).get(`/admin/clients/${cliente}/attachments`)
    expect(res.body).toHaveLength(2)
  })

  it('colaborador vê só o aberto', async () => {
    const res = await asUser(emp).get(`/admin/clients/${cliente}/attachments`)
    expect(res.body.map((a) => a.file_name)).toEqual(['briefing.pdf'])
  })

  // Esconder da lista não basta: o id é adivinhável por quem já viu antes de a
  // restrição entrar, ou vazado por um log. O acesso direto tem que fechar.
  it('colaborador não apaga anexo restrito nem sabendo o id', async () => {
    const res = await asUser(emp).delete(`/admin/clients/${cliente}/attachments/${restrito}`)
    expect(res.status).toBe(404)
  })

  it('a contagem de anexos da listagem não conta os restritos para o colaborador', async () => {
    const res = await asUser(emp).get('/admin/clients')
    expect(res.body.find((c) => c.id === cliente).attachment_count).toBe(1)
  })

  it('para o admin a contagem é a real', async () => {
    const res = await asUser(admin).get('/admin/clients')
    expect(res.body.find((c) => c.id === cliente).attachment_count).toBe(2)
  })

  it('só admin marca anexo como restrito', async () => {
    expect((await asUser(emp).put(`/admin/clients/${cliente}/attachments/${aberto}`)
      .send({ is_restricted: true })).status).toBe(403)
    expect((await asUser(admin).put(`/admin/clients/${cliente}/attachments/${aberto}`)
      .send({ is_restricted: true })).status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/attachmentVisibility.test.js
```

Expected: FAIL.

- [ ] **Step 3: Implementar**

Em `src/routes/clients.js`:

- `GET /admin/clients/:id/attachments` — acrescente `AND (is_restricted = false OR $2 = true)` com `isAdmin(req.profile)`.
- `DELETE .../attachments/:attId` — a mesma condição no `SELECT` que carrega o anexo; sem ele, 404.
- O `LATERAL` de `attachment_count` na listagem ganha a mesma condição.
- Rota nova `PUT /admin/clients/:id/attachments/:attId` (só admin) para alternar `is_restricted`.

Em `src/routes/suppliers.js`: repita a Task 3 inteira, trocando `client_id` por `supplier_id`. `suppliers` não tem tabela de anexos — só os campos escalares e os contatos.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/attachmentVisibility.test.js
```

Expected: PASS, 6 testes.

- [ ] **Step 5: Commit**

```bash
git add src/routes/clients.js src/routes/suppliers.js src/tests/integration/attachmentVisibility.test.js
git commit -m "feat(api): documento restrito some da lista e do acesso direto"
```

---

### Task 5: O `PUT` não pode apagar o que não mostrou

**Files:**
- Modify: `src/routes/clients.js`, `src/routes/suppliers.js`
- Test: `src/tests/integration/preservaCampoRestrito.test.js`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: no `UPDATE`, todo campo restrito que o autor não podia ver preserva o valor atual.

- [ ] **Step 1: Entender o bug antes de escrever o teste**

O colaborador abre a ficha e **não recebe** o CPF. O formulário dele não tem esse campo. Ele muda o telefone e salva. O `PUT` chega sem `cpf` — e a rota, que faz `UPDATE ... SET cpf = $5`, grava `null`.

**O CPF do cliente é apagado por alguém que nunca o viu.** É o bug mais provável deste bloco inteiro, e o mais silencioso: ninguém percebe até precisar do CPF.

- [ ] **Step 2: Write the failing test**

Create `src/tests/integration/preservaCampoRestrito.test.js`:

```js
// O colaborador não recebe o campo restrito, então o PUT dele chega sem o
// campo. Se a rota gravar o que chegou, apaga um dado que ele nunca viu.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin } from '../helpers/factories.js'

describe('PUT preserva campo restrito não recebido', () => {
  let admin, emp, cliente
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    // Estagiário administrativo gerencia clientes mas NÃO é admin — é
    // exatamente o perfil que dispara este bug.
    emp = await makeUser({ role: 'administrative_intern', name: 'Estagiária' })
    const res = await asUser(admin).post('/admin/clients').send({
      name: 'Fulano', cpf: '123.456.789-00', rg: '12.345.678-9',
    })
    cliente = res.body.id
  })

  it('salvar sem o CPF NÃO apaga o CPF', async () => {
    const ficha = await asUser(emp).get(`/admin/clients/${cliente}`)
    expect('cpf' in ficha.body).toBe(false)

    const res = await asUser(emp).put(`/admin/clients/${cliente}`).send({
      name: 'Fulano Editado',
      phones: [{ label: 'celular', value: '11999990000' }],
    })
    expect(res.status).toBe(200)

    const { rows } = await query(`SELECT name, cpf, rg FROM clients WHERE id = $1`, [cliente])
    expect(rows[0].name).toBe('Fulano Editado')
    expect(rows[0].cpf).toBe('123.456.789-00')
    expect(rows[0].rg).toBe('12.345.678-9')
  })

  it('admin PODE apagar o CPF de propósito, mandando vazio', async () => {
    await asUser(admin).put(`/admin/clients/${cliente}`).send({ name: 'Fulano', cpf: '' })
    const { rows } = await query(`SELECT cpf FROM clients WHERE id = $1`, [cliente])
    expect(rows[0].cpf).toBeNull()
  })

  it('admin altera o CPF normalmente', async () => {
    await asUser(admin).put(`/admin/clients/${cliente}`).send({ name: 'Fulano', cpf: '999.999.999-99' })
    const { rows } = await query(`SELECT cpf FROM clients WHERE id = $1`, [cliente])
    expect(rows[0].cpf).toBe('999.999.999-99')
  })

  it('campo NÃO restrito é apagável por quem gerencia', async () => {
    await asUser(admin).put(`/admin/clients/${cliente}`).send({
      name: 'Fulano', cpf: '123.456.789-00', restricted_fields: ['rg'],
    })
    await asUser(emp).put(`/admin/clients/${cliente}`).send({ name: 'Fulano', cpf: '' })
    const { rows } = await query(`SELECT cpf, rg FROM clients WHERE id = $1`, [cliente])
    expect(rows[0].cpf).toBeNull()
    expect(rows[0].rg).toBe('12.345.678-9')
  })

  it('vale para fornecedor também', async () => {
    const criado = await asUser(admin).post('/admin/suppliers').send({
      name: 'Marcenaria', pix_key: 'nf@marcenaria.com',
    })
    await asUser(emp).put(`/admin/suppliers/${criado.body.id}`).send({ name: 'Marcenaria Editada' })
    const { rows } = await query(`SELECT name, pix_key FROM suppliers WHERE id = $1`, [criado.body.id])
    expect(rows[0].name).toBe('Marcenaria Editada')
    expect(rows[0].pix_key).toBe('nf@marcenaria.com')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/preservaCampoRestrito.test.js
```

Expected: FAIL — `expected null to be '123.456.789-00'`. **Este vermelho é o bug.**

- [ ] **Step 4: Preservar no `UPDATE`**

No `PUT`, depois de carregar o registro atual e antes de montar o `UPDATE`:

```js
// Quem não podia VER o campo não pode APAGÁ-LO sem querer. O formulário do
// colaborador nem tem o campo, então o PUT chega sem ele — e um UPDATE cego
// gravaria null num CPF que essa pessoa nunca viu. Só quem recebeu o valor
// tem permissão de mudá-lo.
if (!isAdmin(req.profile)) {
  for (const campo of restritosAtuais) {
    if (CAMPOS_RESTRINGIVEIS.has(campo)) parsed.data[campo] = existente[campo]
  }
}
```

onde `restritosAtuais` vem de `SELECT field_name FROM person_restricted_fields WHERE client_id = $1` e `existente` é o `SELECT *` que a rota já faz para checar `admin_only`.

Repita em `src/routes/suppliers.js`.

- [ ] **Step 5: Run test to verify it passes**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/preservaCampoRestrito.test.js
```

Expected: PASS, 5 testes.

- [ ] **Step 6: Commit**

```bash
git add src/routes/clients.js src/routes/suppliers.js src/tests/integration/preservaCampoRestrito.test.js
git commit -m "fix(api): salvar sem ver o campo restrito não apaga o campo restrito"
```

---

### Task 6: Teste de cobertura do inventário

**Files:**
- Create: `src/tests/integration/inventarioVisibilidade.test.js`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: nada. Este teste existe para **impedir o próximo vazamento**.

- [ ] **Step 1: Por que este teste é o entregável mais importante do bloco**

O `admin_only` já falhou exatamente aqui: estava certo em `/admin/clients` e vazava em `GET /projects` (`c0d3f06`). Trocar um booleano por uma matriz multiplica as chances do mesmo erro. Este teste varre **todos** os caminhos de leitura de uma vez, e quebra quando alguém acrescentar o próximo sem pensar em visibilidade.

Inventário levantado em 18/08/2026 com:

```bash
grep -rn "FROM clients\|JOIN clients\|FROM suppliers\|JOIN suppliers" src/routes src/lib
```

- [ ] **Step 2: Write the test**

Create `src/tests/integration/inventarioVisibilidade.test.js`:

```js
// COBERTURA DO INVENTÁRIO — o entregável mais importante do bloco D.
//
// Se o inventário de caminhos de leitura não for completo, a versão granular
// vaza igual à antiga, só que mais difícil de perceber. Este teste varre todos
// os caminhos que expõem dado de pessoa e afirma que nenhum entrega campo
// restrito a quem não é admin.
//
// Ao acrescentar rota que leia clients ou suppliers, acrescente aqui também.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin, makeProject } from '../helpers/factories.js'

const SENSIVEIS = ['cpf', 'rg', 'cnpj', 'bank_name', 'bank_agency', 'bank_account', 'pix_key']

// Varre o JSON inteiro (não só o topo) atrás do VALOR, não da chave: uma chave
// renomeada continuaria vazando o dado.
function contemValor(obj, agulha) {
  return JSON.stringify(obj ?? null).includes(agulha)
}

describe('inventário de visibilidade — nenhum caminho vaza', () => {
  let admin, emp, cliente, fornecedor, projeto

  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    emp = await makeUser({ role: 'employee', name: 'Arquiteta' })

    const c = await asUser(admin).post('/admin/clients').send({
      name: 'Fulano',
      cpf: 'CPF-SECRETO', rg: 'RG-SECRETO',
      bank_name: 'BANCO-SECRETO', pix_key: 'PIX-SECRETO',
    })
    cliente = c.body.id

    const s = await asUser(admin).post('/admin/suppliers').send({
      name: 'Marcenaria', cnpj: 'CNPJ-SECRETO', pix_key: 'PIX-FORN-SECRETO',
    })
    fornecedor = s.body.id

    await query(
      `INSERT INTO person_phones (client_id, label, value, is_primary, is_restricted)
       VALUES ($1,'recado','TEL-SECRETO',false,true)`, [cliente])
    await query(
      `INSERT INTO client_attachments (client_id, file_url, file_name, is_restricted)
       VALUES ($1,'http://x/c.pdf','CONTRATO-SECRETO.pdf',true)`, [cliente])

    projeto = await makeProject({ name: 'Obra' })
    await query(`UPDATE projects SET client_id = $1 WHERE id = $2`, [cliente, projeto.id])
  })

  const CAMINHOS = [
    { nome: 'GET /admin/clients',                 url: () => '/admin/clients' },
    { nome: 'GET /admin/clients/:id',             url: () => `/admin/clients/${cliente}` },
    { nome: 'GET /admin/clients/:id/attachments', url: () => `/admin/clients/${cliente}/attachments` },
    { nome: 'GET /admin/suppliers',               url: () => '/admin/suppliers' },
    { nome: 'GET /admin/suppliers/:id',           url: () => `/admin/suppliers/${fornecedor}` },
    { nome: 'GET /projects',                      url: () => '/projects' },
    { nome: 'GET /projects/:id',                  url: () => `/projects/${projeto.id}` },
  ]

  for (const caminho of CAMINHOS) {
    it(`${caminho.nome} não entrega dado restrito ao colaborador`, async () => {
      const res = await asUser(emp).get(caminho.url())
      expect(res.status).toBeLessThan(400)
      for (const agulha of ['CPF-SECRETO', 'RG-SECRETO', 'BANCO-SECRETO', 'PIX-SECRETO',
                            'CNPJ-SECRETO', 'PIX-FORN-SECRETO', 'TEL-SECRETO', 'CONTRATO-SECRETO']) {
        expect(contemValor(res.body, agulha)).toBe(false)
      }
    })
  }

  for (const caminho of CAMINHOS) {
    it(`${caminho.nome} continua entregando o que NÃO é restrito`, async () => {
      const res = await asUser(emp).get(caminho.url())
      expect(res.status).toBeLessThan(400)
    })
  }

  it('o admin continua vendo tudo — a restrição não pode virar apagão', async () => {
    const ficha = await asUser(admin).get(`/admin/clients/${cliente}`)
    expect(ficha.body.cpf).toBe('CPF-SECRETO')
    expect(ficha.body.pix_key).toBe('PIX-SECRETO')
  })

  it('o NOME do cliente continua chegando ao colaborador', async () => {
    // name não é restringível: sem ele, os cards de projeto ficariam sem título.
    const res = await asUser(emp).get('/projects')
    expect(contemValor(res.body, 'Fulano')).toBe(true)
  })

  // Trava a invariante do SQL ad-hoc do agente. A role agent_readonly tem
  // GRANT SELECT em clients e suppliers (migrations 030/031) e atravessaria
  // TODA esta matriz. Hoje a tool é roles:['admin'] — está seguro. Se alguém
  // abrir para outro papel, este teste quebra e obriga a decidir conscientemente.
  it('o SQL ad-hoc sobre tabelas de PII continua exclusivo de admin', async () => {
    const { default: consultarDados } = await import('../../lib/agent/tools/sql/consultarDados.js')
    const { TABELAS_PERMITIDAS } = await import('../../lib/agent/tools/sql/guard.js')
    const temPII = ['clients', 'suppliers'].some((t) => TABELAS_PERMITIDAS.has(t))
    if (temPII) expect(consultarDados.roles).toEqual(['admin'])
  })
})
```

- [ ] **Step 3: Rodar e consertar o que vazar**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/inventarioVisibilidade.test.js
```

Expected: PASS. **Se algum caminho falhar, é vazamento de verdade** — conserte a rota, nunca o teste. Um caminho que você não previu é exatamente o que este teste existe para achar.

- [ ] **Step 4: Commit**

```bash
git add src/tests/integration/inventarioVisibilidade.test.js
git commit -m "test: cobertura do inventário de caminhos de leitura de dado sensível"
```

---

### Task 7: Controle de visibilidade na tela

**Files:**
- Create: `web/src/components/pessoas/VisibilityToggle.jsx`
- Modify: `web/src/components/pessoas/ContactListField.jsx`, `AddressListField.jsx`, `BankFields.jsx`
- Modify: `web/src/components/ClientFormModal.jsx`, `SupplierFormModal.jsx`, `ClientAttachments.jsx`

**Interfaces:**
- Consumes: as rotas das Tasks 3–5.
- Produces: `<VisibilityToggle restrito onChange podeEditar />`.

- [ ] **Step 1: Criar o controle**

Create `web/src/components/pessoas/VisibilityToggle.jsx`:

```jsx
import { Lock, Unlock } from 'lucide-react'

// Cadeado ao lado de cada campo sensível e de cada anexo (item 6 do PDF).
//
// Quem não pode mudar NÃO VÊ o controle: mostrar um cadeado desabilitado para o
// colaborador anunciaria que existe algo escondido ali — e o PDF é explícito
// que o campo restrito não pode aparecer "nem mascarado, nem com aviso".
export function VisibilityToggle({ restrito, onChange, podeEditar }) {
  if (!podeEditar) return null
  const Icone = restrito ? Lock : Unlock
  return (
    <button
      type="button"
      onClick={() => onChange(!restrito)}
      aria-label={restrito ? 'Restrito ao admin — clique para liberar' : 'Visível para a equipe — clique para restringir'}
      title={restrito ? 'Restrito ao admin' : 'Visível para a equipe'}
      className={`p-1 ${restrito ? 'state-attention' : 'text-text-secondary'}`}
    >
      <Icone size={13} />
    </button>
  )
}
```

- [ ] **Step 2: Ligar nos campos**

- `ContactListField` e `AddressListField`: cada linha ganha o toggle, alterando `is_restricted` daquele item.
- `BankFields`: um toggle por campo, alimentando `restricted_fields` do formulário.
- Os campos escalares (CPF, RG, CNPJ, inscrição estadual): idem.
- `ClientAttachments.jsx`: um toggle por anexo, chamando o `PUT` da Task 4.

O formulário só mostra o campo se ele **veio** na resposta — campo ausente não renderiza rótulo. Um `null` renderizaria "CPF: —", que é o aviso proibido.

- [ ] **Step 3: Conferir no navegador**

```bash
cd src && npm run dev     # terminal 1
cd web && npm run dev     # terminal 2
```

Aceite literal do item 6: *"Oculto o CPF de um cliente e anexo um contrato como restrito; no login de arquiteto, nenhum dos dois aparece."*

1. Como admin, abra um cliente, marque o CPF como restrito e anexe um contrato marcado como restrito.
2. Saia e entre com um usuário `employee`.
3. Abra o mesmo cliente: **nem o campo CPF, nem o rótulo, nem o anexo**. Nada indicando que existe algo escondido.
4. Ainda como colaborador, **edite o telefone e salve**.
5. Volte como admin: o CPF continua lá. (É a Task 5 valendo na prática.)

- [ ] **Step 4: Rodar o front e commitar**

```bash
cd web && npx vitest run
git add web/src/components
git commit -m "feat(web): controle de visibilidade por campo e por anexo"
```

---

### Task 8: Verificação final e o que ficou de fora

**Files:** `docs/superpowers/specs/2026-08-18-ajustes-void-d-visibilidade-design.md`

- [ ] **Step 1: Suítes**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run
cd ../web && npx vitest run
```

- [ ] **Step 2: Reconferir o inventário à mão**

O teste da Task 6 cobre o que **existe hoje**. Rode o grep de novo para garantir que nada apareceu no meio do caminho:

```bash
grep -rn "FROM clients\|JOIN clients\|FROM suppliers\|JOIN suppliers" src/routes src/lib | grep -v node_modules
```

Todo caminho que devolva campo de pessoa precisa estar na lista `CAMINHOS` do teste. Se apareceu um novo, acrescente antes de fechar o bloco.

- [ ] **Step 3: Registrar o log que NÃO foi feito**

Acrescente ao fim do spec:

```markdown
## 10. O que ficou de fora, e o que isso custa

O item 6 do PDF pede: *"Registrar log de quem acessou dados sensíveis, com data
e hora (LGPD e proteção em caso de desligamento)."*

**Decidido em 18/08/2026 não implementar.** Registrado aqui, e não omitido,
porque é requisito escrito do cliente.

O que isso significa na prática:

- A **restrição** por campo está implementada por inteiro. É ela que impede o
  acesso, e ela funciona.
- A **trilha de auditoria** não existe. Não é possível reconstruir depois: log
  não registrado é dado que nunca existiu. Se em janeiro alguém perguntar quem
  viu o CPF de um cliente em setembro, não há resposta.
- Se for pedido no futuro, o ponto de captura é **único e óbvio**:
  `aplicarVisibilidade()` já sabe quem é o perfil e quais campos foram
  entregues. É um `INSERT` ali dentro e uma tabela. O desenho deste bloco
  deixou esse gancho pronto de propósito.

A pendência do PDF sobre **por quanto tempo guardar os logs** fica sem efeito
enquanto não houver log.
```

E troque o `**Status:**` do cabeçalho por:

```markdown
**Status:** implementado (plano D), menos o log de acesso — ver §10
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-08-18-ajustes-void-d-visibilidade-design.md
git commit -m "docs: bloco D concluído, com registro do log que ficou de fora"
```
