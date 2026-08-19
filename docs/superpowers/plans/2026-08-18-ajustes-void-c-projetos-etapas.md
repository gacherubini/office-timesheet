# Bloco C — Projetos: múltiplos clientes e camada de etapas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um projeto passa a ter mais de um contratante, e a estrutura sai de projeto → tarefas para **projeto → etapa → tarefa**, com trilha de etapas no topo da página, catálogo padrão do escritório e templates que já nascem estruturados.

**Architecture:** Duas tabelas para etapa — um catálogo global editável pelo admin e uma cópia por projeto, com prazo, responsável e status próprios. A cópia (e não uma referência viva) é o que impede renomear uma etapa no catálogo de reescrever o histórico de obras entregues. `tasks.task_type`, que hoje é a "etapa" em texto livre, é migrado para `stage_id` e depois removido. A relação projeto↔cliente vira N:N, com `projects.client_id` mantida sincronizada com o contratante principal para não quebrar os leitores existentes.

**Tech Stack:** PostgreSQL 16, Node 20 / Express 5, node-postgres, Vitest + Supertest; React 19, Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-18-ajustes-void-c-projetos-etapas-design.md`

## Global Constraints

- **Existe dado real em produção.** `tasks.task_type` está preenchido em tarefas reais. Nenhuma tarefa pode ficar órfã.
- **Os números de migration (045–051) são indicativos.** `scripts/migrate.js` aplica por `.sort()` do nome — numere na ordem de **dependência** (catálogo antes de `project_stages`, `project_stages` antes de `tasks.stage_id`), não na ordem em que você implementar.
- **`SET NOT NULL` em `tasks.stage_id` é migration separada**, aplicada só **depois** de o backfill ser verificado em produção. `ALTER TABLE` que falha no meio de um deploy é o pior momento para descobrir uma tarefa órfã.
- **`projects.client_id` não é removida.** Ela é lida em 4 pontos de `routes/projects.js` e na tool `statusProjeto.js` do agente. Fica sincronizada com o contratante principal.
- **A etapa do projeto é cópia, não referência viva.** `project_stages.name` é copiado do catálogo; `catalog_id` fica só como procedência.
- **Progresso e horas por etapa são derivados**, nunca colunas.
- `ALTER TYPE ... ADD VALUE` não pode usar o valor na mesma transação — mesmo cuidado que as migrations 015 e 025 já documentam.
- Banco de teste: `DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test"`.
- Comentários e mensagens em **português**.

---

### Task 1: Migration 045 — vários clientes por projeto

**Files:**
- Create: `src/migrations/045_project_clients.sql`
- Test: `src/tests/integration/projectClients.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `project_clients (project_id, client_id, role, is_primary)`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/integration/projectClients.test.js`:

```js
// "Um projeto pode ter mais de um contratante — casal, sócios, investidor mais
// construtora" (item 7 do PDF de 18/08/2026).
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { makeProject } from '../helpers/factories.js'

async function cliente(nome) {
  const { rows } = await query(`INSERT INTO clients (name) VALUES ($1) RETURNING id`, [nome])
  return rows[0].id
}

describe('045 — vários clientes por projeto', () => {
  let projeto, casal1, casal2
  beforeEach(async () => {
    await resetDb()
    projeto = (await makeProject({ name: 'Grand Terroir 31' })).id
    casal1 = await cliente('Luiz Eduardo')
    casal2 = await cliente('Marina')
  })

  it('guarda dois contratantes com papéis', async () => {
    await query(
      `INSERT INTO project_clients (project_id, client_id, role, is_primary)
       VALUES ($1, $2, 'contratante_principal', true), ($1, $3, 'contratante', false)`,
      [projeto, casal1, casal2],
    )
    const { rows } = await query(
      `SELECT c.name, pc.role, pc.is_primary FROM project_clients pc
       JOIN clients c ON c.id = pc.client_id WHERE pc.project_id = $1 ORDER BY pc.is_primary DESC`,
      [projeto],
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].name).toBe('Luiz Eduardo')
    expect(rows[0].is_primary).toBe(true)
  })

  it('recusa dois principais no mesmo projeto', async () => {
    await query(`INSERT INTO project_clients (project_id, client_id, is_primary) VALUES ($1,$2,true)`,
      [projeto, casal1])
    await expect(
      query(`INSERT INTO project_clients (project_id, client_id, is_primary) VALUES ($1,$2,true)`,
        [projeto, casal2]),
    ).rejects.toThrow(/project_clients_um_principal/)
  })

  it('projetos diferentes têm cada um o seu principal', async () => {
    const outro = (await makeProject({ name: 'Casa 2' })).id
    await query(`INSERT INTO project_clients (project_id, client_id, is_primary) VALUES ($1,$2,true)`, [projeto, casal1])
    await query(`INSERT INTO project_clients (project_id, client_id, is_primary) VALUES ($1,$2,true)`, [outro, casal1])
    const { rows } = await query(`SELECT count(*)::int AS c FROM project_clients WHERE is_primary`)
    expect(rows[0].c).toBe(2)
  })

  it('recusa o mesmo cliente duas vezes no mesmo projeto', async () => {
    await query(`INSERT INTO project_clients (project_id, client_id) VALUES ($1,$2)`, [projeto, casal1])
    await expect(
      query(`INSERT INTO project_clients (project_id, client_id) VALUES ($1,$2)`, [projeto, casal1]),
    ).rejects.toThrow(/duplicate key/)
  })

  it('recusa papel fora da lista', async () => {
    await expect(
      query(`INSERT INTO project_clients (project_id, client_id, role) VALUES ($1,$2,'padrinho')`,
        [projeto, casal1]),
    ).rejects.toThrow(/project_clients_papel_valido/)
  })

  // RESTRICT de propósito: apagar um cliente que é contratante de uma obra tem
  // que doer. CASCADE aqui apagaria o vínculo em silêncio.
  it('não deixa apagar cliente que é contratante', async () => {
    await query(`INSERT INTO project_clients (project_id, client_id) VALUES ($1,$2)`, [projeto, casal1])
    await expect(
      query(`DELETE FROM clients WHERE id = $1`, [casal1]),
    ).rejects.toThrow(/violates foreign key constraint/)
  })

  it('apagar o projeto leva os vínculos junto', async () => {
    await query(`INSERT INTO project_clients (project_id, client_id) VALUES ($1,$2)`, [projeto, casal1])
    await query(`DELETE FROM projects WHERE id = $1`, [projeto])
    const { rows } = await query(`SELECT count(*)::int AS c FROM project_clients`)
    expect(rows[0].c).toBe(0)
  })

  it('o contador da ficha da pessoa conta TODOS os papéis', async () => {
    const investidor = await cliente('Investidor')
    await query(
      `INSERT INTO project_clients (project_id, client_id, role, is_primary)
       VALUES ($1,$2,'contratante_principal',true), ($1,$3,'investidor',false)`,
      [projeto, casal1, investidor],
    )
    const { rows } = await query(
      `SELECT count(*)::int AS c FROM project_clients WHERE client_id = $1`, [investidor])
    expect(rows[0].c).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/projectClients.test.js
```

Expected: FAIL — `relation "project_clients" does not exist`.

- [ ] **Step 3: Escrever a migration**

Create `src/migrations/045_project_clients.sql`:

```sql
-- 045_project_clients.sql
-- "Um projeto pode ter mais de um contratante — casal, sócios, investidor mais
-- construtora. A relação entre projeto e cliente passa a ser de vários para
-- vários." (item 7 do PDF de ajustes de 18/08/2026)
--
-- projects.client_id NÃO É REMOVIDA. Ela aparece em 4 pontos de
-- routes/projects.js e na tool statusProjeto.js do agente. Mantê-la
-- sincronizada com o contratante principal deixa todos esses leitores
-- funcionando sem alteração enquanto as telas novas leem daqui. A sincronia é
-- responsabilidade da rota de escrita, na mesma transação — NÃO de trigger:
-- trigger que reescreve coluna de outra tabela é o tipo de mágica que ninguém
-- encontra quando dá errado.

CREATE TABLE project_clients (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_id  uuid NOT NULL REFERENCES clients(id)  ON DELETE RESTRICT,
  role       text NOT NULL DEFAULT 'contratante',
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, client_id),

  -- Papéis do item 7. TEXT + CHECK em vez de enum: acrescentar papel vira uma
  -- migration de uma linha, sem ALTER TYPE.
  CONSTRAINT project_clients_papel_valido
    CHECK (role IN ('contratante_principal', 'contratante', 'investidor', 'representante'))
);

-- "Um cliente é marcado como principal e é o que aparece no card e no
-- cabeçalho do projeto" — invariante do banco, não do formulário.
CREATE UNIQUE INDEX project_clients_um_principal
  ON project_clients(project_id) WHERE is_primary;

-- "Na ficha da pessoa, o contador de projetos considera todos os papéis."
CREATE INDEX project_clients_client_idx ON project_clients(client_id);

-- Backfill: o cliente único de hoje vira o contratante principal.
INSERT INTO project_clients (project_id, client_id, role, is_primary)
SELECT p.id, p.client_id, 'contratante_principal', true
  FROM projects p
 WHERE p.client_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM project_clients pc WHERE pc.project_id = p.id);
```

- [ ] **Step 4: Acrescentar `project_clients` ao reset dos testes**

O `CASCADE` do `TRUNCATE` já alcança (a tabela referencia `projects` e `clients`, ambas na lista). Confirme rodando a suíte no Step 6.

- [ ] **Step 5: Run test to verify it passes**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/projectClients.test.js
```

Expected: PASS, 8 testes.

- [ ] **Step 6: Rodar a suíte inteira**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run
```

Expected: PASS. Atenção: testes que apagam clientes agora podem bater no `RESTRICT`. Se algum quebrar, o teste é que precisa apagar o projeto antes — o `RESTRICT` está certo.

- [ ] **Step 7: Commit**

```bash
git add src/migrations/045_project_clients.sql src/tests/integration/projectClients.test.js
git commit -m "feat(db): projeto passa a ter vários clientes com papel"
```

---

### Task 2: API — escrever e ler os vários contratantes

**Files:**
- Modify: `src/routes/projects.js`
- Test: `src/tests/integration/projectClientsApi.test.js`

**Interfaces:**
- Consumes: Task 1.
- Produces: `POST`/`PUT /projects` aceitam `clients: [{ client_id, role, is_primary }]`; `GET /projects/:id` devolve `clients[]`; `GET /admin/clients/:id` ganha `project_count`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/integration/projectClientsApi.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeAdmin } from '../helpers/factories.js'

async function cliente(admin, nome) {
  const res = await asUser(admin).post('/admin/clients').send({ name: nome })
  return res.body.id
}

describe('API — vários contratantes por projeto', () => {
  let admin, luiz, marina
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    luiz = await cliente(admin, 'Luiz Eduardo')
    marina = await cliente(admin, 'Marina')
  })

  it('cria projeto com dois contratantes', async () => {
    const res = await asUser(admin).post('/projects').send({
      name: 'Grand Terroir 31',
      clients: [
        { client_id: luiz, role: 'contratante_principal', is_primary: true },
        { client_id: marina, role: 'contratante' },
      ],
    })
    expect(res.status).toBe(201)

    const ficha = await asUser(admin).get(`/projects/${res.body.id}`)
    expect(ficha.body.clients).toHaveLength(2)
    expect(ficha.body.clients.find((c) => c.is_primary).name).toBe('Luiz Eduardo')
  })

  // A invariante que mantém os leitores antigos funcionando.
  it('projects.client_id acompanha o contratante principal', async () => {
    const res = await asUser(admin).post('/projects').send({
      name: 'Obra',
      clients: [
        { client_id: luiz, role: 'contratante_principal', is_primary: true },
        { client_id: marina, role: 'contratante' },
      ],
    })
    const { rows } = await query(`SELECT client_id, client FROM projects WHERE id = $1`, [res.body.id])
    expect(rows[0].client_id).toBe(luiz)
    expect(rows[0].client).toBe('Luiz Eduardo')
  })

  it('trocar o principal atualiza projects.client_id', async () => {
    const res = await asUser(admin).post('/projects').send({
      name: 'Obra',
      clients: [{ client_id: luiz, is_primary: true }, { client_id: marina }],
    })
    await asUser(admin).put(`/projects/${res.body.id}`).send({
      clients: [{ client_id: luiz }, { client_id: marina, is_primary: true }],
    })
    const { rows } = await query(`SELECT client_id, client FROM projects WHERE id = $1`, [res.body.id])
    expect(rows[0].client_id).toBe(marina)
    expect(rows[0].client).toBe('Marina')
  })

  it('promove o primeiro quando nenhum é marcado principal', async () => {
    const res = await asUser(admin).post('/projects').send({
      name: 'Obra',
      clients: [{ client_id: luiz }, { client_id: marina }],
    })
    const ficha = await asUser(admin).get(`/projects/${res.body.id}`)
    expect(ficha.body.clients.find((c) => c.is_primary).name).toBe('Luiz Eduardo')
  })

  it('recusa dois principais com mensagem legível', async () => {
    const res = await asUser(admin).post('/projects').send({
      name: 'Obra',
      clients: [{ client_id: luiz, is_primary: true }, { client_id: marina, is_primary: true }],
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/apenas um.*principal/i)
  })

  it('recusa projeto sem nenhum cliente', async () => {
    const res = await asUser(admin).post('/projects').send({ name: 'Obra', clients: [] })
    expect(res.status).toBe(400)
  })

  it('recusa papel inválido antes de tocar no banco', async () => {
    const res = await asUser(admin).post('/projects').send({
      name: 'Obra', clients: [{ client_id: luiz, role: 'padrinho' }],
    })
    expect(res.status).toBe(400)
    const { rows } = await query(`SELECT count(*)::int AS c FROM projects`)
    expect(rows[0].c).toBe(0)
  })

  it('o contador da ficha da pessoa conta todos os papéis', async () => {
    const investidor = await cliente(admin, 'Investidor')
    await asUser(admin).post('/projects').send({
      name: 'Obra A',
      clients: [{ client_id: luiz, is_primary: true }, { client_id: investidor, role: 'investidor' }],
    })
    await asUser(admin).post('/projects').send({
      name: 'Obra B',
      clients: [{ client_id: investidor, role: 'investidor', is_primary: true }],
    })
    const ficha = await asUser(admin).get(`/admin/clients/${investidor}`)
    expect(ficha.body.project_count).toBe(2)
  })

  it('o projeto aparece na ficha dos dois contratantes', async () => {
    await asUser(admin).post('/projects').send({
      name: 'Grand Terroir 31',
      clients: [{ client_id: luiz, is_primary: true }, { client_id: marina, role: 'contratante' }],
    })
    for (const id of [luiz, marina]) {
      const ficha = await asUser(admin).get(`/admin/clients/${id}`)
      expect(ficha.body.projects.map((p) => p.name)).toContain('Grand Terroir 31')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/projectClientsApi.test.js
```

Expected: FAIL.

- [ ] **Step 3: Implementar**

Em `src/routes/projects.js`, acrescente o normalizador:

```js
const PAPEIS_CLIENTE = new Set(['contratante_principal', 'contratante', 'investidor', 'representante'])

// Mesma forma de normalizarContatos (lib/personContacts.js): valida tudo ANTES
// de abrir a transação e garante exatamente um principal, promovendo o primeiro
// se ninguém marcar. O card e o cabeçalho do projeto precisam de um principal.
function normalizarClientesDoProjeto(lista) {
  const entrada = Array.isArray(lista) ? lista : []
  if (entrada.length === 0) return { error: 'O projeto precisa de ao menos um cliente.' }

  const itens = []
  const vistos = new Set()
  for (const bruto of entrada) {
    const clientId = bruto?.client_id
    if (!clientId) return { error: 'Todo vínculo precisa apontar para um cliente cadastrado.' }
    if (vistos.has(clientId)) return { error: 'O mesmo cliente aparece duas vezes no projeto.' }
    vistos.add(clientId)
    const role = bruto.role || 'contratante'
    if (!PAPEIS_CLIENTE.has(role)) return { error: `Papel de cliente inválido: ${role}.` }
    itens.push({ client_id: clientId, role, is_primary: Boolean(bruto.is_primary) })
  }

  const principais = itens.filter((i) => i.is_primary)
  if (principais.length > 1) return { error: 'Marque apenas um cliente como principal.' }
  if (principais.length === 0) itens[0].is_primary = true

  return { itens }
}

// Regrava os vínculos e SINCRONIZA projects.client_id/client com o principal.
// Na mesma transação, e na rota — não em trigger.
async function gravarClientesDoProjeto(client, projectId, itens) {
  await client.query('DELETE FROM project_clients WHERE project_id = $1', [projectId])
  for (const i of itens) {
    await client.query(
      `INSERT INTO project_clients (project_id, client_id, role, is_primary) VALUES ($1,$2,$3,$4)`,
      [projectId, i.client_id, i.role, i.is_primary])
  }
  const principal = itens.find((i) => i.is_primary)
  const { rows } = await client.query('SELECT name FROM clients WHERE id = $1', [principal.client_id])
  await client.query(
    `UPDATE projects SET client_id = $1, client = $2 WHERE id = $3`,
    [principal.client_id, rows[0]?.name || null, projectId])
}
```

`POST /projects` e `PUT /projects/:id` chamam `normalizarClientesDoProjeto` antes da transação e `gravarClientesDoProjeto` dentro dela. **Compatibilidade:** se o corpo vier com `client_id` (formato antigo) e sem `clients`, converta para `[{ client_id, role: 'contratante_principal', is_primary: true }]` — há chamadas antigas no front que serão migradas só na Task 10.

`GET /projects/:id` ganha:

```js
      query(`SELECT pc.client_id, pc.role, pc.is_primary, c.name
               FROM project_clients pc JOIN clients c ON c.id = pc.client_id
              WHERE pc.project_id = $1 ORDER BY pc.is_primary DESC, c.name`, [id]),
```

E em `src/routes/clients.js`, `GET /admin/clients/:id` ganha `project_count` e `projects`:

```js
      query(`SELECT p.id, p.name, p.status, pc.role
               FROM project_clients pc JOIN projects p ON p.id = pc.project_id
              WHERE pc.client_id = $1 AND p.deleted_at IS NULL
              ORDER BY p.created_at DESC`, [req.params.id]),
```

com `project_count: projects.length` na resposta.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/projectClientsApi.test.js
```

Expected: PASS, 9 testes.

- [ ] **Step 5: Commit**

```bash
git add src/routes/projects.js src/routes/clients.js src/tests/integration/projectClientsApi.test.js
git commit -m "feat(api): projeto aceita vários contratantes e sincroniza o principal"
```

---

### Task 3: Migration 046 — a coluna "Falta info"

**Files:**
- Create: `src/migrations/046_task_status_blocked.sql`
- Modify: `web/src/pages/projectBoard/helpers.js`
- Modify: `web/src/pages/projectBoard/KanbanBoard.jsx`
- Test: `src/tests/integration/taskBlocked.test.js`, `web/src/pages/projectBoard/helpers.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `task_status` ganha `'blocked'`; `COLUMNS` do board passa a ter 5 entradas.

- [ ] **Step 1: Write the failing test (API)**

Create `src/tests/integration/taskBlocked.test.js`:

```js
// "Tarefa parada esperando cliente, topografia ou prefeitura não é 'a fazer'
// nem 'fazendo', e é a maior fonte de atraso" (item 8 do PDF).
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeAdmin, makeProject } from '../helpers/factories.js'

describe('046 — status "Falta info"', () => {
  let admin, projeto
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    projeto = await makeProject({ name: 'Obra' })
  })

  it('o enum aceita blocked', async () => {
    const { rows } = await query(
      `INSERT INTO tasks (project_id, title, status) VALUES ($1,'Aguardando topografia','blocked')
       RETURNING status`, [projeto.id])
    expect(rows[0].status).toBe('blocked')
  })

  it('blocked fica entre in_progress e in_review na ordem do enum', async () => {
    const { rows } = await query(
      `SELECT unnest(enum_range(NULL::task_status))::text AS v`)
    const ordem = rows.map((r) => r.v)
    expect(ordem.indexOf('blocked')).toBeGreaterThan(ordem.indexOf('in_progress'))
    expect(ordem.indexOf('blocked')).toBeLessThan(ordem.indexOf('in_review'))
  })

  it('a rota move a tarefa para blocked e de volta', async () => {
    const criada = await asUser(admin).post(`/projects/${projeto.id}/tasks`).send({ title: 'Implantação' })
    const bloqueada = await asUser(admin).put(`/tasks/${criada.body.id}/status`).send({ status: 'blocked' })
    expect(bloqueada.status).toBe(200)
    expect(bloqueada.body.status).toBe('blocked')

    const voltou = await asUser(admin).put(`/tasks/${criada.body.id}/status`).send({ status: 'in_progress' })
    expect(voltou.body.status).toBe('in_progress')
  })

  it('blocked entra na contagem por status', async () => {
    const criada = await asUser(admin).post(`/projects/${projeto.id}/tasks`).send({ title: 'X' })
    await asUser(admin).put(`/tasks/${criada.body.id}/status`).send({ status: 'blocked' })
    const res = await asUser(admin).get('/tasks/counts')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('blocked')
  })
})
```

- [ ] **Step 2: Write the failing test (front)**

Create `web/src/pages/projectBoard/helpers.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { COLUMNS, statusLabel } from './helpers'

describe('COLUMNS do quadro', () => {
  it('tem cinco colunas na ordem do PDF', () => {
    expect(COLUMNS.map((c) => c.key)).toEqual(['todo', 'in_progress', 'blocked', 'in_review', 'done'])
  })

  it('"Falta info" fica ENTRE fazendo e em revisão', () => {
    const chaves = COLUMNS.map((c) => c.key)
    expect(chaves.indexOf('blocked')).toBe(chaves.indexOf('in_progress') + 1)
    expect(chaves.indexOf('blocked')).toBe(chaves.indexOf('in_review') - 1)
  })

  it('o rótulo é "Falta info"', () => {
    expect(COLUMNS.find((c) => c.key === 'blocked').label).toBe('Falta info')
    expect(statusLabel('blocked')).toBe('Falta info')
  })

  it('os rótulos existentes não mudaram', () => {
    expect(statusLabel('todo')).toBe('A fazer')
    expect(statusLabel('in_progress')).toBe('Fazendo')
    expect(statusLabel('in_review')).toBe('Em revisão')
    expect(statusLabel('done')).toBe('Concluído')
    expect(statusLabel('abandoned')).toBe('Abandonado')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/taskBlocked.test.js
cd ../web && npx vitest run src/pages/projectBoard/helpers.test.js
```

Expected: FAIL nos dois — `invalid input value for enum task_status: "blocked"` e 4 colunas em vez de 5.

- [ ] **Step 4: Migration**

Create `src/migrations/046_task_status_blocked.sql`:

```sql
-- 046_task_status_blocked.sql
-- Coluna "Falta info" entre "Fazendo" e "Em revisão" (item 8 do PDF de ajustes
-- de 18/08/2026). Tarefa parada esperando cliente, topografia ou prefeitura não
-- é "a fazer" nem "fazendo" — separá-la deixa visível o que está travado por
-- terceiros, que é a maior fonte de atraso.
--
-- 'blocked' e não 'waiting_info' porque o RÓTULO pode mudar; o motivo (travado
-- por terceiro) não.
--
-- Mesmo padrão das migrations 015 (abandoned) e 025 (in_review): PG12+ permite
-- ADD VALUE dentro de transação desde que o valor não seja USADO na mesma
-- transação. Aqui só adicionamos.

ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'blocked' AFTER 'in_progress';
```

- [ ] **Step 5: Front — a quinta coluna**

Em `web/src/pages/projectBoard/helpers.js`, `COLUMNS` passa a ser:

```js
export const COLUMNS = [
  { key: 'todo', label: 'A fazer', dot: 'border border-[rgba(15,15,15,.35)]', bar: 'bg-[rgba(15,15,15,.18)]' },
  { key: 'in_progress', label: 'Fazendo', dot: 'bg-orange', bar: 'bg-orange' },
  // Travado por terceiro (cliente, topografia, prefeitura). Cor de atenção, não
  // de erro: não é culpa de ninguém do escritório, mas precisa saltar aos olhos.
  { key: 'blocked', label: 'Falta info', dot: 'bg-state-attention', bar: 'bg-state-attention' },
  { key: 'in_review', label: 'Em revisão', dot: 'bg-brown', bar: 'bg-brown' },
  { key: 'done', label: 'Concluído', dot: 'bg-state-success', bar: 'bg-state-success' },
]
```

Em `web/src/pages/projectBoard/KanbanBoard.jsx`, o grid é `xl:grid-cols-4` fixo. Troque por:

```jsx
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
```

Confira `state-attention` em `web/src/index.css`; se a classe não existir com esse nome, use a mesma que `urgencyClasses('tight')` já usa.

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/taskBlocked.test.js
cd ../web && npx vitest run src/pages/projectBoard/helpers.test.js
```

Expected: PASS nos dois.

- [ ] **Step 7: Conferir a largura do card**

```bash
cd web && npm run dev
```

Abra um projeto numa janela de ~1280px. Cinco colunas espremem o card. Se o título ficar ilegível, prefira **scroll horizontal** a espremer:

```jsx
      <div className="flex gap-4 overflow-x-auto pb-2 [&>*]:min-w-[260px] [&>*]:flex-1">
```

Decida olhando, não no escuro.

- [ ] **Step 8: Commit**

```bash
git add src/migrations/046_task_status_blocked.sql src/tests/integration/taskBlocked.test.js web/src/pages/projectBoard/helpers.js web/src/pages/projectBoard/helpers.test.js web/src/pages/projectBoard/KanbanBoard.jsx
git commit -m "feat: coluna 'Falta info' entre fazendo e em revisão"
```

---

### Task 4: Migration 047 — catálogo de etapas do escritório

**Files:**
- Create: `src/migrations/047_stage_catalog.sql`
- Test: `src/tests/integration/stageCatalog.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `stage_catalog (name, description, position, is_archived)`, semeado.

- [ ] **Step 1: Entender o problema que o seed resolve**

A lista de etapas do PDF (10 itens) **não bate** com a que está em produção hoje (`web/src/lib/taskTypes.js`, alimentando `tasks.task_type`):

| Em uso hoje | No catálogo do PDF |
|---|---|
| Estudo preliminar, Anteprojeto, Executivo | têm correspondente |
| Obra ≈ Acompanhamento de obra, Aprovações ≈ Projeto legal | aproximado |
| **Compatibilização, Detalhamento, Reuniões, Outros** | **não existem** |

Com dado real, semear só as 10 do PDF deixaria órfãs todas as tarefas marcadas com os quatro últimos. O seed é **as 10 do PDF + todo `task_type` distinto que existir**. Os herdados entram com `position 900`, ficam visíveis e separados, e o João Pedro arquiva ou funde pela tela — decisão dele, não da migration.

- [ ] **Step 2: Write the failing test**

Create `src/tests/integration/stageCatalog.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resetDb, query } from '../helpers/db.js'
import { makeProject } from '../helpers/factories.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ARQUIVO = path.resolve(__dirname, '../../migrations/047_stage_catalog.sql')

async function rodarMigration() {
  await query(await readFile(ARQUIVO, 'utf8'))
}

const DEZ_DO_PDF = [
  'Conceituação', 'Estudo de viabilidade', 'Estudo de massa', 'Estudo preliminar',
  'Anteprojeto', 'Projeto legal', 'Projeto arquitetônico', 'Complementares',
  'Executivo', 'Acompanhamento de obra',
]

describe('047 — catálogo de etapas', () => {
  beforeEach(async () => { await resetDb() })

  it('semeia as dez etapas do PDF, na ordem', async () => {
    await rodarMigration()
    const { rows } = await query(
      `SELECT name FROM stage_catalog WHERE position < 900 ORDER BY position`)
    expect(rows.map((r) => r.name)).toEqual(DEZ_DO_PDF)
  })

  // O caso que a lista do PDF sozinha perderia.
  it('herda os task_type de produção que não existem no catálogo', async () => {
    const p = await makeProject({ name: 'Obra' })
    await query(
      `INSERT INTO tasks (project_id, title, task_type) VALUES
        ($1, 'a', 'Compatibilização'), ($1, 'b', 'Detalhamento'), ($1, 'c', 'Reuniões')`, [p.id])
    await rodarMigration()
    const { rows } = await query(
      `SELECT name, position FROM stage_catalog WHERE position = 900 ORDER BY name`)
    expect(rows.map((r) => r.name)).toEqual(['Compatibilização', 'Detalhamento', 'Reuniões'])
  })

  it('task_type que JÁ está no catálogo não vira duplicata', async () => {
    const p = await makeProject({ name: 'Obra' })
    await query(`INSERT INTO tasks (project_id, title, task_type) VALUES ($1,'a','Anteprojeto')`, [p.id])
    await rodarMigration()
    const { rows } = await query(`SELECT count(*)::int AS c FROM stage_catalog WHERE name = 'Anteprojeto'`)
    expect(rows[0].c).toBe(1)
  })

  it('task_type nulo ou em branco não vira etapa', async () => {
    const p = await makeProject({ name: 'Obra' })
    await query(`INSERT INTO tasks (project_id, title, task_type) VALUES ($1,'a',NULL), ($1,'b','   ')`, [p.id])
    await rodarMigration()
    const { rows } = await query(`SELECT count(*)::int AS c FROM stage_catalog WHERE position = 900`)
    expect(rows[0].c).toBe(0)
  })

  it('nome é único', async () => {
    await rodarMigration()
    await expect(
      query(`INSERT INTO stage_catalog (name) VALUES ('Anteprojeto')`),
    ).rejects.toThrow(/duplicate key/)
  })

  it('é idempotente', async () => {
    await rodarMigration()
    await rodarMigration()
    const { rows } = await query(`SELECT count(*)::int AS c FROM stage_catalog`)
    expect(rows[0].c).toBe(10)
  })

  it('etapa arquivada continua existindo', async () => {
    await rodarMigration()
    await query(`UPDATE stage_catalog SET is_archived = true WHERE name = 'Complementares'`)
    const { rows } = await query(`SELECT is_archived FROM stage_catalog WHERE name = 'Complementares'`)
    expect(rows[0].is_archived).toBe(true)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/stageCatalog.test.js
```

Expected: FAIL — `ENOENT`.

- [ ] **Step 4: Escrever a migration**

Create `src/migrations/047_stage_catalog.sql`:

```sql
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

CREATE TABLE stage_catalog (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  description text,
  position    integer NOT NULL DEFAULT 0,
  is_archived boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX stage_catalog_ordem_idx ON stage_catalog(position, name) WHERE NOT is_archived;

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
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/stageCatalog.test.js
```

Expected: PASS, 7 testes.

- [ ] **Step 6: Commit**

```bash
git add src/migrations/047_stage_catalog.sql src/tests/integration/stageCatalog.test.js
git commit -m "feat(db): catálogo global de etapas, semeado com o PDF mais os task_type de produção"
```

---

### Task 5: Migration 048 — etapas do projeto

**Files:**
- Create: `src/migrations/048_project_stages.sql`
- Test: `src/tests/integration/projectStages.test.js`

**Interfaces:**
- Consumes: Task 4.
- Produces: `project_stages` com `status` (`nao_iniciada | em_andamento | entregue | aprovada`), `due_date`, `owner_id`, `catalog_id`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/integration/projectStages.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { makeProject, makeUser } from '../helpers/factories.js'

describe('048 — etapas do projeto', () => {
  let projeto, resp
  beforeEach(async () => {
    await resetDb()
    projeto = await makeProject({ name: 'Grand Terroir 31' })
    resp = await makeUser({ role: 'employee', name: 'Ana' })
  })

  it('guarda nome, ordem, prazo, responsável e status', async () => {
    const { rows } = await query(
      `INSERT INTO project_stages (project_id, name, position, due_date, owner_id, status)
       VALUES ($1,'Anteprojeto',50,'2026-08-24',$2,'em_andamento')
       RETURNING name, position, due_date, owner_id, status`,
      [projeto.id, resp.id])
    expect(rows[0].name).toBe('Anteprojeto')
    expect(rows[0].position).toBe(50)
    expect(rows[0].status).toBe('em_andamento')
    expect(rows[0].owner_id).toBe(resp.id)
  })

  it('nasce como não iniciada', async () => {
    const { rows } = await query(
      `INSERT INTO project_stages (project_id, name) VALUES ($1,'Conceituação') RETURNING status`,
      [projeto.id])
    expect(rows[0].status).toBe('nao_iniciada')
  })

  it('aceita os quatro status do PDF', async () => {
    for (const s of ['nao_iniciada', 'em_andamento', 'entregue', 'aprovada']) {
      const { rows } = await query(
        `INSERT INTO project_stages (project_id, name, status) VALUES ($1,$2,$3) RETURNING status`,
        [projeto.id, `Etapa ${s}`, s])
      expect(rows[0].status).toBe(s)
    }
  })

  it('recusa status fora do enum', async () => {
    await expect(
      query(`INSERT INTO project_stages (project_id, name, status) VALUES ($1,'X','quase')`, [projeto.id]),
    ).rejects.toThrow(/invalid input value for enum/)
  })

  it('recusa duas etapas com o mesmo nome no mesmo projeto', async () => {
    await query(`INSERT INTO project_stages (project_id, name) VALUES ($1,'Anteprojeto')`, [projeto.id])
    await expect(
      query(`INSERT INTO project_stages (project_id, name) VALUES ($1,'Anteprojeto')`, [projeto.id]),
    ).rejects.toThrow(/duplicate key/)
  })

  it('projetos diferentes podem ter etapas de mesmo nome', async () => {
    const outro = await makeProject({ name: 'Casa 2' })
    await query(`INSERT INTO project_stages (project_id, name) VALUES ($1,'Anteprojeto')`, [projeto.id])
    await query(`INSERT INTO project_stages (project_id, name) VALUES ($1,'Anteprojeto')`, [outro.id])
    const { rows } = await query(`SELECT count(*)::int AS c FROM project_stages`)
    expect(rows[0].c).toBe(2)
  })

  // O nome é CÓPIA, não referência: renomear no catálogo não pode reescrever a
  // história de obras já entregues.
  it('renomear no catálogo NÃO renomeia a etapa da obra', async () => {
    const { rows: cat } = await query(
      `INSERT INTO stage_catalog (name, position) VALUES ('Etapa Teste', 500) RETURNING id`)
    await query(
      `INSERT INTO project_stages (project_id, catalog_id, name) VALUES ($1,$2,'Etapa Teste')`,
      [projeto.id, cat[0].id])
    await query(`UPDATE stage_catalog SET name = 'Etapa Renomeada' WHERE id = $1`, [cat[0].id])
    const { rows } = await query(`SELECT name FROM project_stages WHERE project_id = $1`, [projeto.id])
    expect(rows[0].name).toBe('Etapa Teste')
  })

  it('apagar a etapa do catálogo deixa a do projeto viva, sem procedência', async () => {
    const { rows: cat } = await query(
      `INSERT INTO stage_catalog (name, position) VALUES ('Etapa Teste', 500) RETURNING id`)
    await query(
      `INSERT INTO project_stages (project_id, catalog_id, name) VALUES ($1,$2,'Etapa Teste')`,
      [projeto.id, cat[0].id])
    await query(`DELETE FROM stage_catalog WHERE id = $1`, [cat[0].id])
    const { rows } = await query(`SELECT name, catalog_id FROM project_stages WHERE project_id = $1`, [projeto.id])
    expect(rows[0].name).toBe('Etapa Teste')
    expect(rows[0].catalog_id).toBeNull()
  })

  it('apagar o projeto leva as etapas', async () => {
    await query(`INSERT INTO project_stages (project_id, name) VALUES ($1,'Anteprojeto')`, [projeto.id])
    await query(`DELETE FROM projects WHERE id = $1`, [projeto.id])
    const { rows } = await query(`SELECT count(*)::int AS c FROM project_stages`)
    expect(rows[0].c).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/projectStages.test.js
```

Expected: FAIL — `relation "project_stages" does not exist`.

- [ ] **Step 3: Escrever a migration**

Create `src/migrations/048_project_stages.sql`:

```sql
-- 048_project_stages.sql
-- As etapas DESTA obra. Item 8 do PDF: "Nome, ordem no projeto, prazo de
-- entrega e responsável" + "Status próprio: não iniciada, em andamento,
-- entregue, aprovada pelo cliente".
--
-- POR QUE CÓPIA E NÃO REFERÊNCIA VIVA AO CATÁLOGO: a etapa tem prazo,
-- responsável e status DAQUELA obra. Se `name` fosse um ponteiro para
-- stage_catalog, renomear "Anteprojeto" para "Anteprojeto Executivo"
-- reescreveria o histórico de todas as obras entregues. catalog_id fica
-- guardado só como PROCEDÊNCIA — é o que permite perguntar "quanto custa um
-- anteprojeto, em média" sem amarrar o nome.
--
-- PROGRESSO NÃO É COLUNA. O PDF pede "progresso calculado pelas tarefas
-- concluídas (ex.: 5 de 11)" — calculado. Vem de COUNT(*) FILTER sobre as
-- tarefas da etapa. Coluna denormalizada aqui só criaria oportunidade de
-- divergir do que o quadro mostra.

DO $$ BEGIN
  CREATE TYPE stage_status AS ENUM ('nao_iniciada', 'em_andamento', 'entregue', 'aprovada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE project_stages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  catalog_id uuid REFERENCES stage_catalog(id) ON DELETE SET NULL,
  name       text NOT NULL,
  position   integer NOT NULL DEFAULT 0,
  due_date   date,
  owner_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  status     stage_status NOT NULL DEFAULT 'nao_iniciada',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

CREATE INDEX project_stages_projeto_idx ON project_stages(project_id, position);
CREATE INDEX project_stages_owner_idx   ON project_stages(owner_id);

DO $$ BEGIN
  CREATE TRIGGER project_stages_set_updated_at
    BEFORE UPDATE ON project_stages
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/projectStages.test.js
```

Expected: PASS, 9 testes.

- [ ] **Step 5: Commit**

```bash
git add src/migrations/048_project_stages.sql src/tests/integration/projectStages.test.js
git commit -m "feat(db): etapas do projeto com prazo, responsável e status próprio"
```

---

### Task 6: Migration 049 — tarefa pertence a etapa (backfill)

**Files:**
- Create: `src/migrations/049_task_stage_id.sql`
- Test: `src/tests/integration/taskStageBackfill.test.js`

**Interfaces:**
- Consumes: Tasks 4 e 5.
- Produces: `tasks.stage_id` (ainda **nullable**) preenchido para toda tarefa existente.

- [ ] **Step 1: Entender o backfill em três passos**

1. Para cada projeto, criar as `project_stages` a partir dos `task_type` distintos **das tarefas dele**, casando com `stage_catalog` por nome (para herdar `catalog_id` e `position`).
2. `UPDATE tasks SET stage_id` casando `task_type` com o nome da etapa do mesmo projeto.
3. Tarefa **sem** `task_type` cai numa etapa `'Sem etapa'` criada por projeto, `position 999`.

O passo 3 é o que torna o `NOT NULL` possível depois. O PDF exige "campo obrigatório na criação", e sem uma etapa coringa para o legado a constraint não subiria com dado real.

- [ ] **Step 2: Write the failing test**

Create `src/tests/integration/taskStageBackfill.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resetDb, query } from '../helpers/db.js'
import { makeProject } from '../helpers/factories.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CATALOGO = path.resolve(__dirname, '../../migrations/047_stage_catalog.sql')
const BACKFILL = path.resolve(__dirname, '../../migrations/049_task_stage_id.sql')

// A 049 depende do catálogo estar semeado com os herdados — as duas rodam na
// ordem, como rodarão no deploy.
async function rodar() {
  await query(await readFile(CATALOGO, 'utf8'))
  await query(await readFile(BACKFILL, 'utf8'))
}

describe('049 — tarefa passa a pertencer a uma etapa', () => {
  let projeto
  beforeEach(async () => {
    await resetDb()
    projeto = await makeProject({ name: 'Obra' })
  })

  it('task_type que existe no catálogo vira etapa com procedência', async () => {
    await query(`INSERT INTO tasks (project_id, title, task_type) VALUES ($1,'Planta','Anteprojeto')`, [projeto.id])
    await rodar()
    const { rows } = await query(
      `SELECT s.name, s.catalog_id IS NOT NULL AS tem_procedencia
         FROM tasks t JOIN project_stages s ON s.id = t.stage_id
        WHERE t.title = 'Planta'`)
    expect(rows[0].name).toBe('Anteprojeto')
    expect(rows[0].tem_procedencia).toBe(true)
  })

  // O caso que a lista do PDF sozinha perderia — ver Task 4.
  it('task_type herdado (Compatibilização) também acha etapa', async () => {
    await query(`INSERT INTO tasks (project_id, title, task_type) VALUES ($1,'Compat','Compatibilização')`, [projeto.id])
    await rodar()
    const { rows } = await query(
      `SELECT s.name FROM tasks t JOIN project_stages s ON s.id = t.stage_id WHERE t.title = 'Compat'`)
    expect(rows[0].name).toBe('Compatibilização')
  })

  it('tarefa SEM task_type cai em "Sem etapa"', async () => {
    await query(`INSERT INTO tasks (project_id, title) VALUES ($1,'Solta')`, [projeto.id])
    await rodar()
    const { rows } = await query(
      `SELECT s.name, s.position FROM tasks t JOIN project_stages s ON s.id = t.stage_id WHERE t.title = 'Solta'`)
    expect(rows[0].name).toBe('Sem etapa')
    expect(rows[0].position).toBe(999)
  })

  // A asserção que decide se o SET NOT NULL da 050 pode subir.
  it('NENHUMA tarefa fica com stage_id nulo', async () => {
    await query(
      `INSERT INTO tasks (project_id, title, task_type) VALUES
        ($1,'a','Anteprojeto'), ($1,'b','Compatibilização'), ($1,'c',NULL), ($1,'d','   ')`, [projeto.id])
    await rodar()
    const { rows } = await query(`SELECT count(*)::int AS c FROM tasks WHERE stage_id IS NULL`)
    expect(rows[0].c).toBe(0)
  })

  it('cada projeto ganha as SUAS etapas, não as do vizinho', async () => {
    const outro = await makeProject({ name: 'Obra 2' })
    await query(`INSERT INTO tasks (project_id, title, task_type) VALUES ($1,'a','Anteprojeto')`, [projeto.id])
    await query(`INSERT INTO tasks (project_id, title, task_type) VALUES ($1,'b','Executivo')`, [outro.id])
    await rodar()
    const { rows } = await query(
      `SELECT p.name AS projeto, s.name AS etapa FROM project_stages s
       JOIN projects p ON p.id = s.project_id ORDER BY p.name, s.name`)
    expect(rows).toEqual([
      { projeto: 'Obra', etapa: 'Anteprojeto' },
      { projeto: 'Obra 2', etapa: 'Executivo' },
    ])
  })

  it('duas tarefas do mesmo tipo compartilham a etapa', async () => {
    await query(
      `INSERT INTO tasks (project_id, title, task_type) VALUES ($1,'a','Anteprojeto'), ($1,'b','Anteprojeto')`,
      [projeto.id])
    await rodar()
    const { rows } = await query(`SELECT count(DISTINCT stage_id)::int AS c FROM tasks WHERE project_id = $1`, [projeto.id])
    expect(rows[0].c).toBe(1)
  })

  it('a etapa herda a ordem do catálogo', async () => {
    await query(
      `INSERT INTO tasks (project_id, title, task_type) VALUES ($1,'a','Executivo'), ($1,'b','Conceituação')`,
      [projeto.id])
    await rodar()
    const { rows } = await query(
      `SELECT name FROM project_stages WHERE project_id = $1 ORDER BY position`, [projeto.id])
    expect(rows.map((r) => r.name)).toEqual(['Conceituação', 'Executivo'])
  })

  it('é idempotente', async () => {
    await query(`INSERT INTO tasks (project_id, title, task_type) VALUES ($1,'a','Anteprojeto')`, [projeto.id])
    await rodar()
    await query(await readFile(BACKFILL, 'utf8'))
    const { rows } = await query(`SELECT count(*)::int AS c FROM project_stages WHERE project_id = $1`, [projeto.id])
    expect(rows[0].c).toBe(1)
  })

  it('projeto sem tarefa nenhuma não ganha "Sem etapa" à toa', async () => {
    await rodar()
    const { rows } = await query(`SELECT count(*)::int AS c FROM project_stages`)
    expect(rows[0].c).toBe(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/taskStageBackfill.test.js
```

Expected: FAIL — `ENOENT`.

- [ ] **Step 4: Escrever a migration**

Create `src/migrations/049_task_stage_id.sql`:

```sql
-- 049_task_stage_id.sql
-- "Toda tarefa pertence a uma etapa — campo obrigatório na criação" (item 8 do
-- PDF de ajustes de 18/08/2026).
--
-- stage_id entra NULLABLE aqui. O SET NOT NULL é a migration 050, aplicada só
-- depois de este backfill ser verificado em produção: um ALTER TABLE que falha
-- no meio de um deploy é o pior momento para descobrir uma tarefa órfã.
--
-- ON DELETE RESTRICT: apagar etapa com tarefa dentro tem que falhar. Na tela, a
-- mensagem é "mova as N tarefas antes de excluir".

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES project_stages(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS tasks_stage_idx ON tasks(stage_id);

-- Passo 1: cada projeto ganha as etapas dos task_type das SUAS tarefas.
-- O LEFT JOIN no catálogo herda procedência e ordem quando o nome casa.
INSERT INTO project_stages (project_id, catalog_id, name, position)
SELECT DISTINCT t.project_id, sc.id, btrim(t.task_type), COALESCE(sc.position, 900)
  FROM tasks t
  LEFT JOIN stage_catalog sc ON sc.name = btrim(t.task_type)
 WHERE t.task_type IS NOT NULL AND btrim(t.task_type) <> ''
ON CONFLICT (project_id, name) DO NOTHING;

-- Passo 2: amarra a tarefa à etapa do MESMO projeto.
UPDATE tasks t
   SET stage_id = s.id
  FROM project_stages s
 WHERE s.project_id = t.project_id
   AND s.name = btrim(t.task_type)
   AND t.stage_id IS NULL;

-- Passo 3: o legado sem task_type. É o que permite o NOT NULL da 050 — sem uma
-- etapa coringa, a constraint não subiria com dado real. position 999 mantém
-- "Sem etapa" no fim da trilha, onde ela não atrapalha a leitura do projeto.
INSERT INTO project_stages (project_id, name, position)
SELECT DISTINCT t.project_id, 'Sem etapa', 999
  FROM tasks t
 WHERE t.stage_id IS NULL
ON CONFLICT (project_id, name) DO NOTHING;

UPDATE tasks t
   SET stage_id = s.id
  FROM project_stages s
 WHERE s.project_id = t.project_id
   AND s.name = 'Sem etapa'
   AND t.stage_id IS NULL;
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/taskStageBackfill.test.js
```

Expected: PASS, 9 testes.

- [ ] **Step 6: Commit**

```bash
git add src/migrations/049_task_stage_id.sql src/tests/integration/taskStageBackfill.test.js
git commit -m "feat(db): tarefa passa a pertencer a uma etapa, com backfill do task_type"
```

---

### Task 7: API de etapas — CRUD, progresso e horas

**Files:**
- Create: `src/routes/projectStages.js`
- Modify: `src/app.js` (registrar a rota)
- Modify: `src/routes/projectManagement.js` (etapa obrigatória na criação de tarefa)
- Test: `src/tests/integration/stagesApi.test.js`

**Interfaces:**
- Consumes: Tasks 4–6.
- Produces:
  - `GET /projects/:id/stages` → `[{ id, name, position, due_date, owner_id, owner_name, status, done_count, task_count, total_minutes }]`
  - `POST`/`PUT`/`DELETE /projects/:id/stages[/:stageId]`
  - `GET`/`POST`/`PUT /stage-catalog[/:id]`
  - `POST /projects/:id/tasks` passa a exigir `stage_id`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/integration/stagesApi.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeAdmin, makeUser, makeProject } from '../helpers/factories.js'

describe('API de etapas', () => {
  let admin, emp, projeto, etapa
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    emp = await makeUser({ role: 'employee', name: 'Ana' })
    projeto = await makeProject({ name: 'Grand Terroir 31' })
    const { rows } = await query(
      `INSERT INTO project_stages (project_id, name, position) VALUES ($1,'Anteprojeto',50) RETURNING id`,
      [projeto.id])
    etapa = rows[0].id
  })

  it('lista as etapas do projeto na ordem', async () => {
    await query(`INSERT INTO project_stages (project_id, name, position) VALUES ($1,'Conceituação',10)`, [projeto.id])
    const res = await asUser(emp).get(`/projects/${projeto.id}/stages`)
    expect(res.status).toBe(200)
    expect(res.body.map((s) => s.name)).toEqual(['Conceituação', 'Anteprojeto'])
  })

  // "Progresso calculado pelas tarefas concluídas (ex.: 5 de 11)" — o exemplo
  // do próprio PDF.
  it('calcula 5 de 11', async () => {
    for (let i = 0; i < 11; i++) {
      await query(
        `INSERT INTO tasks (project_id, stage_id, title, status) VALUES ($1,$2,$3,$4)`,
        [projeto.id, etapa, `T${i}`, i < 5 ? 'done' : 'todo'])
    }
    const res = await asUser(emp).get(`/projects/${projeto.id}/stages`)
    const a = res.body.find((s) => s.name === 'Anteprojeto')
    expect(a.done_count).toBe(5)
    expect(a.task_count).toBe(11)
  })

  it('etapa sem tarefa devolve 0 de 0, não nulo', async () => {
    const res = await asUser(emp).get(`/projects/${projeto.id}/stages`)
    const a = res.body.find((s) => s.name === 'Anteprojeto')
    expect(a.done_count).toBe(0)
    expect(a.task_count).toBe(0)
  })

  // "O sistema consegue somar quantas horas cada etapa consumiu... não exige
  // trabalho adicional além do vínculo tarefa → etapa" (PDF).
  it('soma as horas das tarefas da etapa', async () => {
    const { rows: t } = await query(
      `INSERT INTO tasks (project_id, stage_id, title) VALUES ($1,$2,'Planta') RETURNING id`,
      [projeto.id, etapa])
    await query(
      `INSERT INTO task_time_logs (task_id, user_id, started_at, ended_at, duration_minutes)
       VALUES ($1,$2,now(),now(),90), ($1,$2,now(),now(),30)`, [t[0].id, emp.id])
    const res = await asUser(emp).get(`/projects/${projeto.id}/stages`)
    expect(res.body.find((s) => s.name === 'Anteprojeto').total_minutes).toBe(120)
  })

  it('cria etapa a partir do catálogo, herdando nome e ordem', async () => {
    const { rows: cat } = await query(
      `INSERT INTO stage_catalog (name, position) VALUES ('Executivo', 90) RETURNING id`)
    const res = await asUser(admin).post(`/projects/${projeto.id}/stages`).send({ catalog_id: cat[0].id })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Executivo')
    expect(res.body.position).toBe(90)
    expect(res.body.catalog_id).toBe(cat[0].id)
  })

  it('cria etapa extra fora do catálogo', async () => {
    const res = await asUser(admin).post(`/projects/${projeto.id}/stages`).send({ name: 'Maquete física' })
    expect(res.status).toBe(201)
    expect(res.body.catalog_id).toBeNull()
  })

  it('atualiza prazo, responsável e status', async () => {
    const res = await asUser(admin).put(`/projects/${projeto.id}/stages/${etapa}`).send({
      due_date: '2026-08-24', owner_id: emp.id, status: 'em_andamento',
    })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('em_andamento')
    expect(res.body.owner_id).toBe(emp.id)
  })

  it('recusa status inválido', async () => {
    const res = await asUser(admin).put(`/projects/${projeto.id}/stages/${etapa}`).send({ status: 'quase' })
    expect(res.status).toBe(400)
  })

  // RESTRICT com mensagem legível, não erro de constraint cru.
  it('não apaga etapa com tarefa dentro — e diz quantas', async () => {
    await query(`INSERT INTO tasks (project_id, stage_id, title) VALUES ($1,$2,'Planta'), ($1,$2,'Cortes')`,
      [projeto.id, etapa])
    const res = await asUser(admin).delete(`/projects/${projeto.id}/stages/${etapa}`)
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/2 tarefa/i)
  })

  it('apaga etapa vazia', async () => {
    const res = await asUser(admin).delete(`/projects/${projeto.id}/stages/${etapa}`)
    expect(res.status).toBe(200)
  })

  it('colaborador não cria nem apaga etapa', async () => {
    expect((await asUser(emp).post(`/projects/${projeto.id}/stages`).send({ name: 'X' })).status).toBe(403)
    expect((await asUser(emp).delete(`/projects/${projeto.id}/stages/${etapa}`)).status).toBe(403)
  })

  it('a criação de tarefa EXIGE etapa', async () => {
    const res = await asUser(emp).post(`/projects/${projeto.id}/tasks`).send({ title: 'Sem etapa' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/etapa/i)
  })

  it('a criação aceita etapa e devolve stage_id', async () => {
    const res = await asUser(emp).post(`/projects/${projeto.id}/tasks`).send({ title: 'Planta', stage_id: etapa })
    expect(res.status).toBe(201)
    expect(res.body.stage_id).toBe(etapa)
  })

  it('recusa etapa de OUTRO projeto', async () => {
    const outro = await makeProject({ name: 'Casa 2' })
    const { rows } = await query(
      `INSERT INTO project_stages (project_id, name) VALUES ($1,'Executivo') RETURNING id`, [outro.id])
    const res = await asUser(emp).post(`/projects/${projeto.id}/tasks`).send({ title: 'X', stage_id: rows[0].id })
    expect(res.status).toBe(400)
  })

  it('o catálogo é listado sem as arquivadas', async () => {
    await query(`INSERT INTO stage_catalog (name, position) VALUES ('Ativa', 10), ('Velha', 20)`)
    await query(`UPDATE stage_catalog SET is_archived = true WHERE name = 'Velha'`)
    const res = await asUser(admin).get('/stage-catalog')
    expect(res.body.map((s) => s.name)).toContain('Ativa')
    expect(res.body.map((s) => s.name)).not.toContain('Velha')
  })

  it('só quem gerencia projetos edita o catálogo', async () => {
    const res = await asUser(emp).post('/stage-catalog').send({ name: 'Nova' })
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/stagesApi.test.js
```

Expected: FAIL — 404 nas rotas de etapa.

- [ ] **Step 3: Criar a rota**

Create `src/routes/projectStages.js`. O `SELECT` da listagem é o coração — progresso e horas saem de `LATERAL`, no mesmo formato que `routes/clients.js` já usa para contar anexos:

```js
import { Router } from 'express'
import { query } from '../lib/db.js'
import { requireAuth } from '../middleware/auth.js'
import { requireProjectManagement } from '../middleware/requireProjectManagement.js'
import { logger } from '../lib/logger.js'

const router = Router()

const STATUS_VALIDOS = new Set(['nao_iniciada', 'em_andamento', 'entregue', 'aprovada'])

// Progresso e horas são DERIVADOS, nunca colunas: coluna denormalizada aqui só
// criaria a chance de divergir do que o quadro mostra. As horas saem de graça —
// task_time_logs (migration 012) já amarra tempo à tarefa, e a tarefa agora tem
// etapa. É exatamente o que o PDF prevê: "não exige trabalho adicional além do
// vínculo tarefa → etapa".
const SELECT_ETAPAS = `
  SELECT s.id, s.project_id, s.catalog_id, s.name, s.position, s.due_date,
         s.owner_id, u.name AS owner_name, s.status,
         COALESCE(tc.task_count, 0)::int AS task_count,
         COALESCE(tc.done_count, 0)::int AS done_count,
         COALESCE(hc.total_minutes, 0)::int AS total_minutes
    FROM project_stages s
    LEFT JOIN users u ON u.id = s.owner_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS task_count,
             COUNT(*) FILTER (WHERE status = 'done')::int AS done_count
        FROM tasks WHERE stage_id = s.id
    ) tc ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(l.duration_minutes), 0)::int AS total_minutes
        FROM task_time_logs l JOIN tasks t ON t.id = l.task_id
       WHERE t.stage_id = s.id
    ) hc ON true`

router.get('/projects/:id/stages', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `${SELECT_ETAPAS} WHERE s.project_id = $1 ORDER BY s.position, s.name`, [req.params.id])
    return res.json(rows)
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em GET /projects/:id/stages')
    return res.status(400).json({ error: err.message })
  }
})

export default router
```

Complete com:

- **`POST /projects/:id/stages`** (`requireProjectManagement`): com `catalog_id`, copia `name` e `position` do catálogo; sem ele, exige `name` e deixa `catalog_id` nulo.
- **`PUT /projects/:id/stages/:stageId`**: `name`, `position`, `due_date`, `owner_id`, `status` (validado contra `STATUS_VALIDOS`).
- **`DELETE`**: conta as tarefas antes e devolve `400` com `` `Mova as ${n} tarefas desta etapa antes de excluí-la.` `` — nunca deixe o `RESTRICT` estourar cru.
- **`GET /stage-catalog`** (qualquer autenticado, `WHERE NOT is_archived`), **`POST`/`PUT /stage-catalog[/:id]`** (`requireProjectManagement`).

Registre em `src/app.js` junto das outras rotas.

- [ ] **Step 4: Etapa obrigatória na criação de tarefa**

Em `src/routes/projectManagement.js`, `POST /projects/:id/tasks`:

```js
  const { title, description, assignee_id, due_date, priority, stage_id } = req.body
  ...
  // "Toda tarefa pertence a uma etapa — campo obrigatório na criação" (PDF).
  if (!stage_id) {
    return res.status(400).json({ error: 'A tarefa precisa de uma etapa.' })
  }
  const { rows: st } = await query(
    'SELECT id FROM project_stages WHERE id = $1 AND project_id = $2', [stage_id, projectId])
  // Checar o projeto junto evita amarrar a tarefa a uma etapa de outra obra.
  if (!st[0]) {
    return res.status(400).json({ error: 'Etapa não encontrada neste projeto.' })
  }
```

Troque `task_type` por `stage_id` no `INSERT` e no `RETURNING`, e acrescente `t.stage_id` aos `SELECT` de `GET /tasks`, `GET /me/tasks` e `GET /tasks/:id`. **Deixe `task_type` nos SELECTs por enquanto** — ele só sai na Task 9.

- [ ] **Step 5: Run test to verify it passes**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/stagesApi.test.js
```

Expected: PASS, 16 testes.

- [ ] **Step 6: Rodar a suíte inteira**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run
```

Expected: alguns testes antigos que criam tarefa **vão quebrar** — eles não mandam `stage_id`, e agora ele é obrigatório. **Isso é a mudança funcionando.** Ajuste cada um criando a etapa antes e passando o id. Não relaxe a validação para os testes passarem.

- [ ] **Step 7: Commit**

```bash
git add src/routes/projectStages.js src/app.js src/routes/projectManagement.js src/tests/integration/stagesApi.test.js src/tests/integration
git commit -m "feat(api): etapas do projeto com progresso, horas e etapa obrigatória na tarefa"
```

---

### Task 8: Templates que geram etapas

**Files:**
- Create: `src/migrations/050_template_stages.sql`
- Modify: `src/routes/projects.js` (geração), `src/routes/projectTemplates.js`
- Test: `src/tests/integration/templateStages.test.js`

**Interfaces:**
- Consumes: Tasks 4–7.
- Produces: `project_template_stages`; `project_template_items.template_stage_id`.

- [ ] **Step 1: Write the failing test**

O PDF chama isto de "o principal ganho do módulo": *"ao criar um projeto por template, o sistema já gera as etapas e as tarefas-padrão de cada uma — o projeto nasce estruturado em vez de em branco"*.

Create `src/tests/integration/templateStages.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeAdmin } from '../helpers/factories.js'

describe('templates geram etapas e tarefas', () => {
  let admin, cliente
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    const { rows } = await query(`INSERT INTO clients (name) VALUES ('Cliente') RETURNING id`)
    cliente = rows[0].id
    await query(`INSERT INTO stage_catalog (name, position) VALUES ('Anteprojeto', 50), ('Executivo', 90)`)
  })

  async function templateComEtapas() {
    const { rows: t } = await query(
      `INSERT INTO project_templates (name) VALUES ('Residencial') RETURNING id`)
    const { rows: cat } = await query(`SELECT id, name FROM stage_catalog ORDER BY position`)
    const { rows: e1 } = await query(
      `INSERT INTO project_template_stages (template_id, catalog_id, name, position)
       VALUES ($1,$2,'Anteprojeto',0) RETURNING id`, [t.id ?? t[0].id, cat[0].id])
    const { rows: e2 } = await query(
      `INSERT INTO project_template_stages (template_id, catalog_id, name, position)
       VALUES ($1,$2,'Executivo',1) RETURNING id`, [t[0].id, cat[1].id])
    await query(
      `INSERT INTO project_template_items (template_id, template_stage_id, title, position)
       VALUES ($1,$2,'Planta pav. tipo',0), ($1,$2,'Cortes AA/BB',1), ($1,$3,'Detalhamento',0)`,
      [t[0].id, e1[0].id, e2[0].id])
    return t[0].id
  }

  it('cria o projeto com as etapas do template', async () => {
    const tpl = await templateComEtapas()
    const res = await asUser(admin).post('/projects').send({
      name: 'Casa Nova', client_id: cliente, template_id: tpl,
    })
    expect(res.status).toBe(201)
    const etapas = await asUser(admin).get(`/projects/${res.body.id}/stages`)
    expect(etapas.body.map((s) => s.name)).toEqual(['Anteprojeto', 'Executivo'])
  })

  it('as tarefas nascem na etapa certa', async () => {
    const tpl = await templateComEtapas()
    const res = await asUser(admin).post('/projects').send({
      name: 'Casa Nova', client_id: cliente, template_id: tpl,
    })
    const { rows } = await query(
      `SELECT t.title, s.name AS etapa FROM tasks t JOIN project_stages s ON s.id = t.stage_id
        WHERE t.project_id = $1 ORDER BY s.position, t.position`, [res.body.id])
    expect(rows).toEqual([
      { title: 'Planta pav. tipo', etapa: 'Anteprojeto' },
      { title: 'Cortes AA/BB', etapa: 'Anteprojeto' },
      { title: 'Detalhamento', etapa: 'Executivo' },
    ])
  })

  it('a etapa gerada guarda a procedência do catálogo', async () => {
    const tpl = await templateComEtapas()
    const res = await asUser(admin).post('/projects').send({
      name: 'Casa Nova', client_id: cliente, template_id: tpl,
    })
    const { rows } = await query(
      `SELECT count(*)::int AS c FROM project_stages WHERE project_id = $1 AND catalog_id IS NOT NULL`,
      [res.body.id])
    expect(rows[0].c).toBe(2)
  })

  // Compatibilidade para trás: templates criados antes deste bloco não têm
  // etapas, e as tarefas deles precisam ir para algum lugar.
  it('template ANTIGO (sem etapas) gera tarefas em "Sem etapa"', async () => {
    const { rows: t } = await query(
      `INSERT INTO project_templates (name) VALUES ('Antigo') RETURNING id`)
    await query(
      `INSERT INTO project_template_items (template_id, title, position) VALUES ($1,'Tarefa solta',0)`, [t[0].id])
    const res = await asUser(admin).post('/projects').send({
      name: 'Casa Velha', client_id: cliente, template_id: t[0].id,
    })
    expect(res.status).toBe(201)
    const { rows } = await query(
      `SELECT s.name FROM tasks t JOIN project_stages s ON s.id = t.stage_id WHERE t.project_id = $1`,
      [res.body.id])
    expect(rows[0].name).toBe('Sem etapa')
  })

  it('projeto sem template nasce sem etapa e sem tarefa', async () => {
    const res = await asUser(admin).post('/projects').send({ name: 'Vazio', client_id: cliente })
    const etapas = await asUser(admin).get(`/projects/${res.body.id}/stages`)
    expect(etapas.body).toHaveLength(0)
  })

  it('apagar o template leva as etapas dele', async () => {
    const tpl = await templateComEtapas()
    await query(`DELETE FROM project_templates WHERE id = $1`, [tpl])
    const { rows } = await query(`SELECT count(*)::int AS c FROM project_template_stages`)
    expect(rows[0].c).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/templateStages.test.js
```

Expected: FAIL — `relation "project_template_stages" does not exist`.

- [ ] **Step 3: Migration**

Create `src/migrations/050_template_stages.sql`:

```sql
-- 050_template_stages.sql
-- "Ao criar um projeto por template, o sistema já gera as etapas e as
-- tarefas-padrão de cada uma — o projeto nasce estruturado em vez de em branco.
-- Esse é o principal ganho do módulo." (item 8 do PDF de 18/08/2026)
--
-- template_stage_id é NULLABLE de propósito: templates criados antes deste
-- bloco não têm etapa, e as tarefas deles caem em "Sem etapa" na geração.
-- Compatibilidade para trás sem código condicional espalhado.

CREATE TABLE project_template_stages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
  catalog_id  uuid REFERENCES stage_catalog(id) ON DELETE SET NULL,
  name        text NOT NULL,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, name)
);

CREATE INDEX project_template_stages_template_idx
  ON project_template_stages(template_id, position);

ALTER TABLE project_template_items
  ADD COLUMN IF NOT EXISTS template_stage_id uuid
    REFERENCES project_template_stages(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS project_template_items_stage_idx
  ON project_template_items(template_stage_id);
```

- [ ] **Step 4: Gerar etapas em `POST /projects`**

Em `src/routes/projects.js`, dentro da transação que já existe, **antes** do laço de tarefas:

```js
      // Etapas do template primeiro: a tarefa precisa do stage_id para nascer.
      const etapaPorTemplateStage = new Map()
      for (const ts of templateStages) {
        const { rows: st } = await client.query(
          `INSERT INTO project_stages (project_id, catalog_id, name, position)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [created.id, ts.catalog_id, ts.name, ts.position])
        etapaPorTemplateStage.set(ts.id, st[0].id)
      }

      // Template antigo (item sem etapa) cai numa etapa coringa, criada só se
      // realmente houver item órfão — projeto sem template não ganha "Sem etapa".
      let semEtapaId = null
      async function etapaDoItem(item) {
        if (item.template_stage_id) return etapaPorTemplateStage.get(item.template_stage_id)
        if (!semEtapaId) {
          const { rows: se } = await client.query(
            `INSERT INTO project_stages (project_id, name, position) VALUES ($1,'Sem etapa',999) RETURNING id`,
            [created.id])
          semEtapaId = se[0].id
        }
        return semEtapaId
      }
```

E o `INSERT` das tarefas passa a receber `stage_id`. Carregue `templateStages` junto de `templateItems`, **antes** de abrir a transação:

```js
      const { rows: stages } = await query(
        `SELECT id, catalog_id, name, position FROM project_template_stages
          WHERE template_id = $1 ORDER BY position, name`, [template_id])
```

e acrescente `template_stage_id` ao `SELECT` de `templateItems`.

Em `src/routes/projectTemplates.js`, acrescente as etapas ao `GET /project-templates/:id` e ao `POST`/`PUT` de template.

- [ ] **Step 5: Run test to verify it passes**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/templateStages.test.js
```

Expected: PASS, 6 testes.

- [ ] **Step 6: Commit**

```bash
git add src/migrations/050_template_stages.sql src/routes/projects.js src/routes/projectTemplates.js src/tests/integration/templateStages.test.js
git commit -m "feat: template gera etapas e tarefas-padrão de cada uma"
```

---

### Task 9: Front — trilha, gerenciar etapas e contratantes na tela

**Files:**
- Create: `web/src/pages/projectBoard/StageTrack.jsx`
- Create: `web/src/pages/projectBoard/StageTrack.test.jsx`
- Create: `web/src/pages/projectBoard/StageManagerModal.jsx`
- Create: `web/src/pages/projectBoard/ProjectClientsField.jsx`
- Modify: `web/src/pages/projectBoard/ProjectPage.jsx`
- Modify: `web/src/pages/projectBoard/EtapaChip.jsx`
- Modify: `web/src/pages/projectBoard/NewTaskModal.jsx`
- Modify: `web/src/pages/ProjectBoardPage.jsx`
- Modify: `web/src/pages/PessoasPage.jsx` (lista de projetos na ficha)

**Interfaces:**
- Consumes: `GET /projects/:id/stages` (Task 7); `clients[]` de `GET /projects/:id` e `projects[]` de `GET /admin/clients/:id` (Task 2).
- Produces: `<StageTrack etapas etapaAtiva onSelecionar />`, `<StageManagerModal ... />`, `<ProjectClientsField itens onChange />`.

> **Esta tarefa fecha o item 7 e a metade visível do item 8.** A Task 2 entregou
> os vários contratantes só na API, e a Task 7 entregou o CRUD de etapas só na
> API. Os aceites do PDF para os dois são fluxos de **tela** — sem esta tarefa,
> nenhum dos dois pode ser demonstrado.

- [ ] **Step 1: Write the failing test**

Create `web/src/pages/projectBoard/StageTrack.test.jsx`:

```jsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { StageTrack } from './StageTrack'

afterEach(cleanup)

const ETAPAS = [
  { id: 'e1', name: 'Conceituação', status: 'aprovada', done_count: 3, task_count: 3, due_date: null, total_minutes: 600 },
  { id: 'e2', name: 'Anteprojeto', status: 'em_andamento', done_count: 5, task_count: 11, due_date: '2026-08-24', total_minutes: 1200 },
  { id: 'e3', name: 'Executivo', status: 'nao_iniciada', done_count: 0, task_count: 0, due_date: null, total_minutes: 0 },
]

describe('StageTrack', () => {
  it('mostra as etapas na ordem recebida', () => {
    render(<StageTrack etapas={ETAPAS} etapaAtiva={null} onSelecionar={() => {}} />)
    const nomes = screen.getAllByRole('button').map((b) => b.textContent)
    expect(nomes.join(' ')).toContain('Conceituação')
    expect(nomes.join(' ')).toContain('Anteprojeto')
  })

  // O exemplo literal do PDF.
  it('mostra o progresso "5/11"', () => {
    render(<StageTrack etapas={ETAPAS} etapaAtiva={null} onSelecionar={() => {}} />)
    expect(document.body.textContent).toContain('5/11')
  })

  it('etapa sem tarefa não mostra progresso', () => {
    render(<StageTrack etapas={[ETAPAS[2]]} etapaAtiva={null} onSelecionar={() => {}} />)
    expect(document.body.textContent).not.toContain('0/0')
  })

  it('clicar numa etapa chama onSelecionar com o id', () => {
    const onSelecionar = vi.fn()
    render(<StageTrack etapas={ETAPAS} etapaAtiva={null} onSelecionar={onSelecionar} />)
    fireEvent.click(screen.getByRole('button', { name: /anteprojeto/i }))
    expect(onSelecionar).toHaveBeenCalledWith('e2')
  })

  it('clicar na etapa ativa desmarca (volta para todas)', () => {
    const onSelecionar = vi.fn()
    render(<StageTrack etapas={ETAPAS} etapaAtiva="e2" onSelecionar={onSelecionar} />)
    fireEvent.click(screen.getByRole('button', { name: /anteprojeto/i }))
    expect(onSelecionar).toHaveBeenCalledWith(null)
  })

  it('mostra o prazo da etapa em andamento', () => {
    render(<StageTrack etapas={ETAPAS} etapaAtiva={null} onSelecionar={() => {}} />)
    expect(document.body.textContent).toContain('24/08')
  })

  it('sem etapa nenhuma, orienta em vez de mostrar vazio', () => {
    render(<StageTrack etapas={[]} etapaAtiva={null} onSelecionar={() => {}} />)
    expect(document.body.textContent).toMatch(/nenhuma etapa/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web && npx vitest run src/pages/projectBoard/StageTrack.test.jsx
```

Expected: FAIL — `Failed to resolve import "./StageTrack"`.

- [ ] **Step 3: Implementar a trilha**

Create `web/src/pages/projectBoard/StageTrack.jsx`, seguindo o mockup do PDF: cartões lado a lado, ✓ para aprovada/entregue, ▷ para em andamento, ○ para não iniciada; barra de progresso; prazo na etapa corrente. Clicar filtra; clicar de novo volta para todas.

```jsx
import { Check, Play, Circle } from 'lucide-react'
import { formatShortDate, formatMinutes } from './helpers'

const META = {
  aprovada:     { Icone: Check,  classe: 'state-success' },
  entregue:     { Icone: Check,  classe: 'state-success' },
  em_andamento: { Icone: Play,   classe: 'state-attention' },
  nao_iniciada: { Icone: Circle, classe: 'text-text-secondary' },
}

// "A trilha de etapas fica no topo da página do projeto, mostrando o que já
// fechou, onde o projeto está e o que vem." (item 8 do PDF)
export function StageTrack({ etapas = [], etapaAtiva, onSelecionar }) {
  if (etapas.length === 0) {
    return (
      <p className="text-xs text-text-secondary">
        Nenhuma etapa neste projeto ainda. Use "Gerenciar etapas" para começar.
      </p>
    )
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {etapas.map((e) => {
        const { Icone, classe } = META[e.status] || META.nao_iniciada
        const ativa = etapaAtiva === e.id
        const pct = e.task_count > 0 ? Math.round((e.done_count / e.task_count) * 100) : 0
        return (
          <button
            key={e.id}
            type="button"
            // Clicar na ativa volta para "todas as etapas" — o mesmo gesto que
            // filtrou desfaz o filtro, sem precisar procurar um botão de limpar.
            onClick={() => onSelecionar(ativa ? null : e.id)}
            className={`min-w-[150px] flex-1 border p-2.5 text-left transition-colors ${
              ativa ? 'border-accent bg-accent/5' : 'border-border-subtle hover:border-text-secondary'
            }`}
          >
            <span className={`flex items-center gap-1.5 text-xs ${classe}`}>
              <Icone size={12} /> {e.name}
            </span>
            {e.task_count > 0 && (
              <>
                <span className="mt-1.5 block text-[11px] tabular-nums text-text-secondary">
                  {e.done_count}/{e.task_count}
                  {e.due_date && ` · vence ${formatShortDate(e.due_date)}`}
                  {e.total_minutes > 0 && ` · ${formatMinutes(e.total_minutes)}`}
                </span>
                <span className="mt-1 block h-0.5 bg-surface-alt">
                  <span className="block h-full bg-state-success" style={{ width: `${pct}%` }} />
                </span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd web && npx vitest run src/pages/projectBoard/StageTrack.test.jsx
```

Expected: PASS, 7 testes.

- [ ] **Step 5: Ligar na página do projeto**

Em `ProjectPage.jsx`: carregue `GET /projects/:id/stages`, guarde `etapaAtiva` em estado, renderize a trilha logo abaixo do cabeçalho e filtre as tarefas (`etapaAtiva ? tasks.filter((t) => t.stage_id === etapaAtiva) : tasks`). O título do quadro vira `Tarefas · <nome da etapa>` ou `Tarefas · Todas as etapas`, e um botão "Todas as etapas" limpa o filtro — exatamente o mockup do PDF.

- [ ] **Step 6: `EtapaChip` troca de fonte**

Hoje ele lê a lista estática de `web/src/lib/taskTypes.js`. Passa a receber as etapas **daquele projeto** por prop e a chamar `onChange(stageId)`. O componente sobrevive; só a fonte de dados muda.

Em `NewTaskModal.jsx`, a etapa vira campo **obrigatório**, pré-preenchido com `etapaAtiva` quando houver — quem está olhando o Anteprojeto quase sempre quer criar tarefa nele.

- [ ] **Step 7: "Gerenciar etapas" — a tela que ativa e acrescenta**

O PDF: *"Cada projeto ativa as que se aplicam e pode acrescentar extras."* A API
está pronta desde a Task 7; falta o lugar de usá-la.

Create `web/src/pages/projectBoard/StageManagerModal.jsx`. Aberto pelo link
"Gerenciar etapas" no cabeçalho da trilha (como no mockup do PDF), visível só
para quem gerencia projetos:

- Lista o **catálogo** (`GET /stage-catalog`) com uma marcação por etapa já ativa
  no projeto. Marcar chama `POST /projects/:id/stages` com `catalog_id`;
  desmarcar chama `DELETE`.
- Campo "acrescentar etapa extra" que chama `POST` com `name` livre — é o
  "pode acrescentar extras" do PDF.
- Cada etapa ativa edita **prazo, responsável, ordem e status** in-place
  (`PUT /projects/:id/stages/:stageId`).
- O `DELETE` de etapa com tarefa devolve 400 com `Mova as N tarefas...`
  (Task 7). Mostre essa mensagem como está — ela já diz o que fazer.

- [ ] **Step 8: Contratantes na tela do projeto**

Hoje `ProjectPage.jsx:142` mostra `Cliente: {project.client}` — um só — e o card
lateral (`:267`) mostra um nome, um telefone e um endereço. Com N:N isso passa a
esconder informação: o segundo contratante existe no banco e não aparece em
lugar nenhum.

- **Cabeçalho** (`:142`): continua mostrando o **principal** (`project.client`,
  já sincronizado pela Task 2). Não mexa — é o que o PDF pede para o cabeçalho.
- **Card lateral** (`:267`): passa a listar **todos** os `clients[]` de
  `GET /projects/:id`, cada um com o papel ao lado (Contratante principal,
  Investidor…). O contato mostrado continua sendo o do principal.
- **Formulário de projeto**: create `ProjectClientsField.jsx` — lista repetível
  de `{ client_id, role, is_primary }`, no mesmo contrato dos campos do bloco B
  (`{ itens, onChange }`), com seletor de cliente sobre o cadastro (nunca texto
  livre) e um rádio para o principal. Reaproveite a lógica de "remover o
  principal promove o primeiro" do `ContactListField`.

- [ ] **Step 9: Projetos na ficha da pessoa**

`GET /admin/clients/:id` já devolve `projects[]` e `project_count` desde a
Task 2. Na ficha de Pessoas, mostre a lista com o papel em cada projeto — é a
segunda metade do aceite do item 7 (*"o projeto aparece na ficha dos dois"*), e
o contador precisa bater com todos os papéis, não só com contratante principal.

- [ ] **Step 10: Rodar tudo e conferir**

```bash
cd web && npx vitest run && npm run dev
```

Roteiro de aceite, os **dois** itens:

*Item 8 — "Abro um projeto e vejo a trilha de etapas com o progresso; clico em
'anteprojeto' e o quadro mostra só as tarefas dessa etapa; ao criar projeto por
template, etapas e tarefas-padrão já vêm prontas."*

1. Abra um projeto: trilha no topo, com progresso.
2. Clique em "Anteprojeto": o quadro filtra. Clique de novo: volta para todas.
3. "Gerenciar etapas": ative uma do catálogo, acrescente uma extra, defina prazo
   e responsável, tente excluir uma com tarefa dentro (tem que recusar dizendo
   quantas).
4. Crie projeto por template: etapas e tarefas já vêm prontas.

*Item 7 — "Cadastro um projeto com dois contratantes; ambos aparecem no projeto
e o projeto aparece na ficha dos dois."*

5. Crie um projeto com dois contratantes (um principal, um investidor).
6. Na página do projeto: o cabeçalho mostra o principal, o card lateral mostra
   os dois com os papéis.
7. Abra a ficha de **cada um** dos dois em Pessoas: o projeto está lá, e o
   contador conta os dois.

- [ ] **Step 11: Commit**

```bash
git add web/src/pages/projectBoard web/src/pages/ProjectBoardPage.jsx web/src/pages/PessoasPage.jsx
git commit -m "feat(web): trilha de etapas, gerenciar etapas e vários contratantes na tela"
```

---

### Task 10: Agente — acompanhar o vocabulário novo

**Files:**
- Modify: `src/lib/agent/tools/read/statusProjeto.js`
- Modify: `src/lib/agent/tools/read/tasksTravadas.js`
- Modify: `src/lib/agent/tools/write/proporEditarTask.js`
- Modify: `src/lib/agent/context/dominio/*.md`
- Test: os testes de agente que já existem em `src/tests/unit/agent` e `src/tests/integration/agent`

**Interfaces:**
- Consumes: Tasks 3, 6 e 7.
- Produces: nada novo — paridade com o sistema.

- [ ] **Step 1: Entender por que isto não é opcional**

O agente tem um lint que cruza prompt × registry (`dominioLint.test.js`). Mexer em `task_type` e no board sem mexer nele deixa o assistente falando de um sistema que não existe mais — e o colaborador confia no que ele diz.

- [ ] **Step 2: Ajustar `statusProjeto.js`**

O `SELECT` conta por status com `COUNT(*) FILTER`. Acrescente `blocked`:

```js
                COUNT(*) FILTER (WHERE status = 'blocked')::int     AS blocked,
```

e inclua o campo no que a tool devolve.

- [ ] **Step 3: Ajustar `tasksTravadas.js`**

Hoje ele **infere** "travada" por dias parada. Com `blocked` explícito, a inferência vira dado. Use os dois sinais: tarefa em `blocked` é travada por definição; tarefa parada há muitos dias continua sendo sinalizada. É a melhoria mais óbvia que o bloco C destrava.

- [ ] **Step 4: Ajustar `proporEditarTask.js`**

`task_type` → `stage_id`, resolvido por **nome dentro do projeto** (a etapa é por projeto; o mesmo nome existe em várias obras). Nome ambíguo ou inexistente devolve erro legível, no mesmo padrão de `tools/pessoas.js`.

- [ ] **Step 5: Vocabulário nos prompts**

Em `src/lib/agent/context/dominio/*.md`: acrescente **etapa** (projeto → etapa → tarefa), **"Falta info"** como coluna do quadro, e **múltiplos contratantes** por projeto. Remova qualquer menção a `task_type`.

- [ ] **Step 6: Rodar os testes do agente**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/unit/agent tests/integration/agent
```

Expected: PASS, incluindo `dominioLint.test.js`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/agent
git commit -m "feat(agente): vocabulário de etapas, 'Falta info' e múltiplos contratantes"
```

---

### Task 11: Migration 051 — fechar a torneira do `task_type`

**Files:**
- Create: `src/migrations/051_task_stage_not_null.sql`
- Delete: `web/src/lib/taskTypes.js`
- Test: `src/tests/integration/taskStageNotNull.test.js`

**Interfaces:**
- Consumes: Tasks 6–10.
- Produces: `tasks.stage_id NOT NULL`; `tasks.task_type` removida.

- [ ] **Step 1: A cerca deste bloco**

**Não execute esta tarefa antes de a 049 ter rodado em produção e o resultado ter sido conferido.** Rode lá:

```sql
SELECT count(*) FROM tasks WHERE stage_id IS NULL;   -- precisa ser 0
SELECT name, count(*) FROM project_stages s JOIN tasks t ON t.stage_id = s.id
 GROUP BY name ORDER BY 2 DESC;                      -- confira se faz sentido
```

Se a primeira não der zero, **pare**: alguma tarefa escapou do backfill e o `SET NOT NULL` vai falhar no meio do deploy.

- [ ] **Step 2: Write the failing test**

Create `src/tests/integration/taskStageNotNull.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { makeProject } from '../helpers/factories.js'

describe('051 — etapa obrigatória no banco', () => {
  let projeto
  beforeEach(async () => {
    await resetDb()
    projeto = await makeProject({ name: 'Obra' })
  })

  it('o banco recusa tarefa sem etapa', async () => {
    await expect(
      query(`INSERT INTO tasks (project_id, title) VALUES ($1,'Órfã')`, [projeto.id]),
    ).rejects.toThrow(/null value in column "stage_id"/)
  })

  it('a coluna task_type não existe mais', async () => {
    const { rows } = await query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'tasks' AND column_name = 'task_type'`)
    expect(rows).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/taskStageNotNull.test.js
```

Expected: FAIL — a tarefa órfã é aceita e `task_type` ainda existe.

- [ ] **Step 4: Migration**

Create `src/migrations/051_task_stage_not_null.sql`:

```sql
-- 051_task_stage_not_null.sql
-- Fecha o item 8: "toda tarefa pertence a uma etapa — campo obrigatório".
--
-- SEPARADA DA 049 DE PROPÓSITO. O backfill precisou rodar e ser CONFERIDO em
-- produção antes desta subir: um ALTER TABLE que falha no meio de um deploy é o
-- pior momento para descobrir uma tarefa órfã.
--
-- Rede de segurança: se ainda houver órfã, esta migration falha com uma
-- mensagem que diz o que fazer, em vez de um erro de constraint cru.
DO $$
DECLARE orfas integer;
BEGIN
  SELECT count(*) INTO orfas FROM tasks WHERE stage_id IS NULL;
  IF orfas > 0 THEN
    RAISE EXCEPTION 'Ainda há % tarefa(s) sem etapa. Rode a 049 antes desta migration.', orfas;
  END IF;
END $$;

ALTER TABLE tasks ALTER COLUMN stage_id SET NOT NULL;

-- task_type cumpriu o papel dele: virou stage_id na 049. Manter os dois seria
-- dois campos com o mesmo significado, confundindo a tela e o agente.
DROP INDEX IF EXISTS tasks_task_type_idx;
ALTER TABLE tasks DROP COLUMN IF EXISTS task_type;
```

- [ ] **Step 5: Limpar o front**

```bash
rm web/src/lib/taskTypes.js
grep -rn "taskTypes\|task_type" web/src src/routes src/lib | grep -v node_modules
```

O `grep` precisa voltar **vazio**. Se sobrar algo, é leitor esquecido — conserte antes de seguir.

- [ ] **Step 6: Run test to verify it passes**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run
cd ../web && npx vitest run
```

Expected: PASS nas duas.

- [ ] **Step 7: Commit**

```bash
git add src/migrations/051_task_stage_not_null.sql web/src
git commit -m "feat(db): etapa obrigatória e remoção do task_type"
```

---

### Task 12: Verificação final do bloco C

**Files:** `docs/superpowers/specs/2026-08-18-ajustes-void-c-projetos-etapas-design.md`

- [ ] **Step 1: Suítes**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run
cd ../web && npx vitest run
```

- [ ] **Step 2: Migrations num banco do zero**

```bash
docker run -d --rm --name ots-c -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=office_timesheet -p 5435:5432 postgres:16-alpine
sleep 5
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5435/office_timesheet" npm run migrate
```

Expected: todas `OK`. Ao terminar: `docker stop ots-c`.

- [ ] **Step 3: Roteiro de aceite**

| Item | Aceite |
|---|---|
| 7 | "Cadastro um projeto com dois contratantes; ambos aparecem no projeto e o projeto aparece na ficha dos dois." |
| 8 | "Abro um projeto e vejo a trilha de etapas com o progresso; clico em 'anteprojeto' e o quadro mostra só as tarefas dessa etapa; ao criar projeto por template, etapas e tarefas-padrão já vêm prontas." |

Confira também a coluna "Falta info" entre Fazendo e Em revisão, e as horas somadas por etapa.

- [ ] **Step 4: Levar o catálogo ao cliente**

Depois do deploy, a tela de catálogo mostra as 10 do PDF **mais** os herdados de produção com `position 900`. Mande a lista ao João Pedro para ele arquivar o que não for etapa contratual — "Reuniões" e "Outros" provavelmente saem. Isso fecha a primeira "definição pendente" do PDF sem ter travado nada.

- [ ] **Step 5: Atualizar o spec e commitar**

```markdown
**Status:** implementado (plano C)
```

```bash
git add docs/superpowers/specs/2026-08-18-ajustes-void-c-projetos-etapas-design.md
git commit -m "docs: bloco C concluído (itens 7 e 8)"
```
