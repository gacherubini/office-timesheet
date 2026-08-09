# Agente de Gestão — Fase 1, Milestone 5 (SQL de leitura restrito, admin-only) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a tool `consultar_dados(sql)` — SQL **somente leitura, admin-only** — para perguntas ad-hoc que as tools curadas (M2) não cobrem, com **duas camadas independentes**: a **garantia física** é uma **role read-only** do Postgres com `GRANT SELECT` só na allowlist (não escreve nem se tentar), e a **defesa em profundidade + UX** é um guard que faz *parse real* do SQL (verbo único `SELECT`, statement único, allowlist de tabela, `LIMIT` forçado) e uma transação `READ ONLY` com `statement_timeout`. Admin-only por construção: a allowlist é de **tabela**, não recorta linha/coluna, então liberar para outros papéis vazaria apontamento/`hourly_rate` alheios (design §8.2).

**Architecture:** A tool é um objeto `{ kind:'read', espelha:null, roles:['admin'], definition, run }` em `src/lib/agent/tools/sql/consultarDados.js`, registrado no `registry.js` filtrado por papel — logo **nunca é oferecida a não-admin**. `espelha` é `null` de propósito: não há um endpoint único espelhado; o recorte é a role read-only + allowlist, não a paridade com uma rota. O `run` chama o **guard** (`sql/guard.js`, parse + sanitização) e roda o SQL sanitizado por um **pool separado** ligado à role read-only (`sql/roPool.js`), dentro de uma transação `READ ONLY` com `statement_timeout`. O núcleo (loop, cliente, sessão, propostas, rota) não muda: o `loop.js` já captura erro de `run()` e o devolve ao modelo como `{ error }` (verificado em `src/lib/agent/loop.js:50-56`), e já audita `count` (`loop.js:52`).

**Tech Stack:** Node/Express 5 (ESM), Postgres (`pg`), `openai` (endpoint OpenAI-compatible da NVIDIA), **`node-sql-parser`** (novo — parser SQL puro-JS, dialeto Postgres), Vitest + Supertest.

**Origem:** design em `docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md` — §8.2 (SQL restrito), §9 camada 5 (escrita tipada, leitura SQL confinada), §16 (role read-only + secret novo), §18 (testes de segurança). Antecessor: M2 em `docs/superpowers/plans/2026-08-09-agente-gestao-fase1-m2-tools-leitura.md` (padrão de tool, registry, testes de integração).

> **Notas de decisão (2026-08-09), tomadas ao escrever este plano contra o código:**
> 1. **A role read-only recebe `GRANT SELECT` apenas na allowlist**, não em todas as tabelas — defesa em profundidade (§16: "GRANT SELECT ON \<allowlisted tables\>"). Se o guard falhasse e deixasse passar `SELECT ... FROM notifications`, a role ainda barraria por falta de privilégio. **Decisão que o humano deve confirmar** (allowlist-only vs. todas as tabelas) e cujo conteúdo exato da allowlist precisa bater com o `dominio/`.
> 2. **Parser real, não regex.** Escolhido `node-sql-parser` (puro-JS, sem build nativo) para derivar do *AST*: nº de statements, tipo do statement e a lista de tabelas referenciadas. Regex de allow/deny é enganável (comentários, `/**/`, CTE que escreve, `union`), e um allow/deny enganável é *finding* de segurança. **Mas o parser não é a fronteira de segurança** — a fronteira é a role read-only + transação `READ ONLY`. O parser é UX (erro claro) e primeira barreira. Essa divisão é o que torna aceitável não usar o parser nativo do próprio Postgres (`libpg-query`, mais correto porém nativo): mesmo que o `node-sql-parser` interprete diferente do Postgres em algum canto, o pior caso é uma leitura recusada por engano (UX) ou uma leitura extra que a role e a transação `READ ONLY` já confinam — nunca uma escrita.
> 3. **`espelha: null`.** Diferente das tools do M2, esta não espelha um endpoint e **não entra no teste de paridade** (§18): não há rota equivalente de "SQL livre". O que a substitui é o teste da role física (Task 1) e os testes de guard (Task 2).
> 4. **`LIMIT` forçado por *wrapping*.** Em vez de cirurgia no AST, o guard envelopa a consulta: `SELECT * FROM (<sql>) AS _agente_sub LIMIT <max>`. Cap independente de haver `LIMIT` interno. Caveat registrado: colunas de saída ambíguas exigem *alias* do lado do usuário — aceitável para uma ferramenta de admin.

---

## Global Constraints

Herdadas do M1/M2, mais as específicas de segurança deste milestone. Todo task as respeita.

- **A garantia é a role, não o parser.** A afirmação "não escreve" deve ser verdadeira mesmo com o parser desligado. Por isso Task 1 (role física) vem antes de Task 2 (guard), e o teste da role tenta um `INSERT` de verdade e espera *permission denied*.
- **Admin-only, verificado.** `roles:['admin']` no objeto da tool; teste explícito de que `buildRegistry({role:'employee'})` (e demais papéis não-admin) **não** inclui `consultar_dados` (design §18: "não é oferecida a quem não é admin").
- **Pool separado.** O SQL ad-hoc nunca passa pelo pool do app (`src/lib/db.js`, role de escrita). Passa só pelo `roPool.js`, ligado a `AGENT_READONLY_DATABASE_URL` — um secret novo (§16).
- **Sem vazar interno (§17).** SQL inválido/negado é recusado com motivo curto ("apenas SELECT é permitido", "tabela fora da allowlist: X"), nunca com stack/detalhe do parser.
- **Constantes por env, no padrão de `guards.js`.** `SQL_LIMITS` (`maxRows`, `statementTimeoutMs`) mora em `src/lib/agent/guards.js`, `Number(process.env.X) || default`, igual ao `LIMITS` existente (`guards.js:3-7`).
- **Senha da role fora do SQL.** A migration cria a role e concede `SELECT`; **não** grava senha. A senha é setada fora de banda (secret do Fly + `ALTER ROLE ... PASSWORD`); nos testes um `beforeAll` faz o `ALTER ROLE` com senha efêmera e monta a URL da role.
- **Idempotência da migration.** `CREATE ROLE` sob `IF NOT EXISTS` (via `pg_roles`), no estilo idempotente que o `migrate.js` espera (roda cada arquivo uma vez, dentro de `BEGIN/COMMIT` — `migrate.js:35-40`).
- **Estilo:** ESM, comentários pt-BR na densidade dos arquivos vizinhos, sem TypeScript. Testes com Vitest/Supertest, factories de `src/tests/helpers/`. Integração exige o Postgres de teste (`docker-compose.test.yml`, `DATABASE_URL` em `localhost:5432`).

---

## File Structure

**Novos módulos (`src/lib/agent/tools/sql/`)**
- `roPool.js` — pool preguiçoso da role read-only + `runReadOnly(sql, params)` (transação `READ ONLY` + `statement_timeout`).
- `guard.js` — `validarESanitizar(sql)` (parse real, verbo/statement/allowlist, `LIMIT` forçado) + `TABELAS_PERMITIDAS` + erro tipado `SqlRecusado`.
- `consultarDados.js` — a tool `{ kind:'read', espelha:null, roles:['admin'], definition, run }`.

**Nova migration**
- `src/migrations/030_agent_readonly_role.sql` — cria a role `agent_readonly` (LOGIN, sem senha), `GRANT CONNECT`/`USAGE`, `GRANT SELECT` só na allowlist, `REVOKE` o resto.

**Novo helper de teste**
- `src/tests/helpers/roDb.js` — `ensureRoRole()`: `ALTER ROLE` com senha efêmera + monta `AGENT_READONLY_DATABASE_URL` a partir da `DATABASE_URL`.

**Modificados**
- `src/lib/agent/guards.js` — acrescenta `SQL_LIMITS`.
- `src/lib/agent/tools/registry.js` — registra `consultar_dados` (admin-only).
- `src/lib/agent/context/dominio/admin.md` — descreve a tool ad-hoc, allowlist e limites.
- `src/lib/agent/evals/cases.js` — casos novos (ad-hoc do admin; e negativo: colaborador não tem SQL).
- `src/package.json` — dependência `node-sql-parser`.
- `docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md` — nota de infra (secret + operação da senha).

**Testes**
- Integração: `src/tests/integration/agent/roRole.test.js` (a role não escreve), `consultarDados.test.js` (SELECT válido + timeout).
- Unit: `src/tests/unit/agent/sqlGuard.test.js` (verbos/statements/allowlist/LIMIT), `src/tests/unit/agent/registry.test.js` (ampliar: admin-only), `src/tests/unit/agent/prompt.test.js` (ampliar: domínio cita a tool).

---

## Task 1: Role read-only física + `roPool` (a rede de segurança real)

Antes de qualquer parser: garantir no **banco** que a conexão do SQL ad-hoc não escreve. Esta é a camada 5 do §9 e o item de infra do §16.

**Files:**
- Create: `src/migrations/030_agent_readonly_role.sql`
- Create: `src/lib/agent/tools/sql/roPool.js`
- Create: `src/tests/helpers/roDb.js`
- Create: `src/tests/integration/agent/roRole.test.js`
- Modify: `src/lib/agent/guards.js`

**Interfaces:**
- `SQL_LIMITS = { maxRows, statementTimeoutMs }` (em `guards.js`).
- `getRoPool() → pg.Pool` (preguiçoso, de `AGENT_READONLY_DATABASE_URL`).
- `runReadOnly(sql, params?) → Promise<rows[]>` (transação `READ ONLY` + `SET LOCAL statement_timeout`).
- `ensureRoRole(pw?) → Promise<void>` (helper de teste).

- [ ] **Step 1: Write the failing test**

```javascript
// src/tests/integration/agent/roRole.test.js
import { describe, it, expect, beforeAll } from 'vitest'
import { ensureRoRole } from '../../helpers/roDb.js'
import { runReadOnly } from '../../../lib/agent/tools/sql/roPool.js'

describe('role read-only agent_readonly (garantia física)', () => {
  beforeAll(async () => {
    await ensureRoRole() // ALTER ROLE + define AGENT_READONLY_DATABASE_URL
  })

  it('consegue LER uma tabela da allowlist', async () => {
    const rows = await runReadOnly('SELECT count(*) AS c FROM users')
    expect(rows[0]).toHaveProperty('c')
  })

  it('NÃO consegue escrever, mesmo mandando um INSERT direto', async () => {
    await expect(
      runReadOnly(`INSERT INTO projects (name, status) VALUES ('x', 'active')`),
    ).rejects.toThrow(/read-only|permission denied|somente leitura|only/i)
  })

  it('NÃO consegue ler tabela fora da allowlist (sem privilégio)', async () => {
    await expect(runReadOnly('SELECT * FROM notifications')).rejects.toThrow(
      /permission denied|não|denied/i,
    )
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd src && npx vitest run tests/integration/agent/roRole.test.js`
Expected: FAIL — `roPool.js`/`roDb.js` inexistentes e a role `agent_readonly` ainda não criada. (Exige o Postgres de teste de pé; a migration nova roda no `globalSetup`.)

- [ ] **Step 3: Implement — migration da role**

```sql
-- src/migrations/030_agent_readonly_role.sql
-- Role SOMENTE-LEITURA para a tool consultar_dados (§8.2 / §16). É a GARANTIA
-- física de que o SQL ad-hoc não escreve — o parser (guard.js) é só defesa em
-- profundidade. Defesa em profundidade também aqui: GRANT SELECT apenas na
-- allowlist, não no schema inteiro. A SENHA não vai nesta migration: é setada
-- fora de banda (secret do Fly + ALTER ROLE); nos testes, um beforeAll faz o
-- ALTER ROLE com senha efêmera (ver tests/helpers/roDb.js).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_readonly') THEN
    CREATE ROLE agent_readonly LOGIN;
  END IF;
END $$;

-- CONNECT no banco atual (o nome varia entre prod e teste → SQL dinâmico).
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO agent_readonly', current_database());
END $$;

-- Ponto de partida limpo: nada, e nem poder criar objeto no schema.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM agent_readonly;
REVOKE CREATE ON SCHEMA public FROM agent_readonly;
GRANT USAGE ON SCHEMA public TO agent_readonly;

-- Só SELECT, só na allowlist (as tabelas descritas em dominio/). Manter em
-- sincronia com TABELAS_PERMITIDAS em src/lib/agent/tools/sql/guard.js.
GRANT SELECT ON
  users, projects, clients, suppliers,
  time_entries, time_entry_pauses,
  tasks, task_comments,
  vacation_requests, expense_requests, bonuses,
  presences, performance_simulations
TO agent_readonly;
```

- [ ] **Step 4: Implement — `SQL_LIMITS` em `guards.js`**

Acrescente ao fim de `src/lib/agent/guards.js` (mesmo padrão de `LIMITS`):

```javascript
// Limites do SQL de leitura restrito (§8.2). maxRows é o teto do LIMIT forçado;
// statementTimeoutMs corta consulta longa no banco. Env-overridable, folgado.
export const SQL_LIMITS = {
  maxRows: Number(process.env.AGENT_SQL_MAX_ROWS) || 200,
  statementTimeoutMs: Number(process.env.AGENT_SQL_TIMEOUT_MS) || 3000,
}
```

- [ ] **Step 5: Implement — `roPool.js`**

```javascript
// src/lib/agent/tools/sql/roPool.js
// Pool preguiçoso ligado à role SOMENTE-LEITURA (AGENT_READONLY_DATABASE_URL).
// Separado do pool do app (db.js) de propósito: é o ÚNICO caminho por onde o SQL
// ad-hoc passa, e essa conexão fisicamente não escreve (§9, camada 5).
import pg from 'pg'
import { SQL_LIMITS } from '../../guards.js'

// Mesmos type parsers do db.js, caso este módulo seja carregado isolado
// (DATE como string 'YYYY-MM-DD', NUMERIC como number).
pg.types.setTypeParser(1082, (v) => v)
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)))

let roPool = null

export function getRoPool() {
  if (roPool) return roPool
  const url = process.env.AGENT_READONLY_DATABASE_URL
  if (!url) throw new Error('AGENT_READONLY_DATABASE_URL não configurada')
  roPool = new pg.Pool({
    connectionString: url,
    max: Number(process.env.AGENT_SQL_POOL_MAX) || 4,
    idleTimeoutMillis: 30_000,
  })
  return roPool
}

// Roda o SQL (já sanitizado) numa transação READ ONLY com statement_timeout. A
// transação READ ONLY é cinto-e-suspensório sobre a role: mesmo que algo
// escapasse do parser, o Postgres barra a escrita aqui também.
export async function runReadOnly(sql, params = []) {
  const client = await getRoPool().connect()
  try {
    await client.query('BEGIN READ ONLY')
    await client.query(`SET LOCAL statement_timeout = ${SQL_LIMITS.statementTimeoutMs}`)
    const { rows } = await client.query(sql, params)
    await client.query('COMMIT')
    return rows
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
```

- [ ] **Step 6: Implement — helper de teste `roDb.js`**

```javascript
// src/tests/helpers/roDb.js
// Prepara a role read-only para os testes: define uma senha efêmera (a migration
// criou a role SEM senha) e monta AGENT_READONLY_DATABASE_URL a partir da
// DATABASE_URL de teste, trocando só as credenciais.
import { query } from './db.js'

export async function ensureRoRole(pw = 'ro_test_pw') {
  await query(`ALTER ROLE agent_readonly LOGIN PASSWORD '${pw}'`)
  const u = new URL(process.env.DATABASE_URL)
  u.username = 'agent_readonly'
  u.password = pw
  process.env.AGENT_READONLY_DATABASE_URL = u.toString()
}
```

- [ ] **Step 7: Run tests to green**

Run: `cd src && npx vitest run tests/integration/agent/roRole.test.js`
Expected: PASS (3 testes). O `INSERT` falha por `BEGIN READ ONLY` **e** por falta de privilégio; o `SELECT` em `notifications` falha por falta de privilégio (fora da allowlist) — as duas camadas provadas.

- [ ] **Step 8: Commit**

```bash
git add src/migrations/030_agent_readonly_role.sql src/lib/agent/tools/sql/roPool.js \
  src/lib/agent/guards.js src/tests/helpers/roDb.js src/tests/integration/agent/roRole.test.js
git commit -m "feat(agente): role read-only do Postgres + roPool para o SQL restrito (§8.2/§16)"
```

---

## Task 2: Guard de SQL — parse real, verbo/statement/allowlist/LIMIT

O guard é a defesa em profundidade e a boa UX: rejeita o que não é `SELECT`, statement único, allowlist de tabela e força `LIMIT`. Faz *parse real* (não regex) para não ser enganável.

**Files:**
- Modify: `src/package.json` (dependência `node-sql-parser`)
- Create: `src/lib/agent/tools/sql/guard.js`
- Create: `src/tests/unit/agent/sqlGuard.test.js`

**Interfaces:**
- `TABELAS_PERMITIDAS: Set<string>` — allowlist crua (sem schema), espelha o `GRANT SELECT` da migration.
- `class SqlRecusado extends Error` — erro tipado de recusa.
- `validarESanitizar(sql) → { sql, tabelas }` — lança `SqlRecusado` com motivo curto; devolve o SQL já envelopado com `LIMIT`.

- [ ] **Step 1: Instalar o parser**

Run: `cd src && npm install node-sql-parser`
Expected: `node-sql-parser` entra em `dependencies` do `src/package.json`. (Puro-JS, sem build nativo.)

- [ ] **Step 2: Write the failing test**

```javascript
// src/tests/unit/agent/sqlGuard.test.js
import { describe, it, expect } from 'vitest'
import { validarESanitizar, SqlRecusado, TABELAS_PERMITIDAS } from '../../../lib/agent/tools/sql/guard.js'

describe('guard do SQL restrito', () => {
  it('aceita um SELECT numa tabela da allowlist e força LIMIT', () => {
    const { sql, tabelas } = validarESanitizar('SELECT id, name FROM users')
    expect(sql).toMatch(/LIMIT \d+/i)
    expect(sql).toMatch(/from \(/i) // envelopado
    expect(tabelas).toContain('users')
  })

  it('rejeita INSERT/UPDATE/DELETE', () => {
    for (const q of [
      `INSERT INTO users (name) VALUES ('x')`,
      `UPDATE users SET name = 'x'`,
      `DELETE FROM users`,
    ]) {
      expect(() => validarESanitizar(q)).toThrow(SqlRecusado)
    }
  })

  it('rejeita DDL (DROP/ALTER/CREATE)', () => {
    for (const q of ['DROP TABLE users', 'ALTER TABLE users ADD c int', 'CREATE TABLE t (a int)']) {
      expect(() => validarESanitizar(q)).toThrow(SqlRecusado)
    }
  })

  it('rejeita múltiplos statements encadeados por ;', () => {
    expect(() => validarESanitizar('SELECT 1; DROP TABLE users')).toThrow(SqlRecusado)
  })

  it('rejeita CTE que escreve (WITH ... INSERT/UPDATE/DELETE)', () => {
    const q = `WITH x AS (DELETE FROM users RETURNING id) SELECT * FROM x`
    expect(() => validarESanitizar(q)).toThrow(SqlRecusado)
  })

  it('rejeita tabela fora da allowlist', () => {
    expect(() => validarESanitizar('SELECT * FROM notifications')).toThrow(/allowlist/i)
    expect(TABELAS_PERMITIDAS.has('notifications')).toBe(false)
  })

  it('rejeita lixo que não parseia como SELECT', () => {
    expect(() => validarESanitizar('não é sql')).toThrow(SqlRecusado)
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cd src && npx vitest run tests/unit/agent/sqlGuard.test.js`
Expected: FAIL — `guard.js` inexistente.

- [ ] **Step 4: Implement — `guard.js`**

```javascript
// src/lib/agent/tools/sql/guard.js
// Defesa em profundidade + UX para o SQL restrito (§8.2). Faz PARSE REAL (AST),
// não regex: regex de allow/deny é enganável (comentários, CTE que escreve,
// union), e allow/deny enganável é finding de segurança. Mas o parser NÃO é a
// fronteira — a fronteira é a role read-only + transação READ ONLY do roPool.
// Aqui garantimos: 1 statement, verbo SELECT, tabelas na allowlist, LIMIT forçado.
import { Parser } from 'node-sql-parser'
import { SQL_LIMITS } from '../../guards.js'

const parser = new Parser()
const OPT = { database: 'postgresql' }

// Allowlist de TABELA (não de linha/coluna — por isso a tool é admin-only, §8.2).
// Deve espelhar o GRANT SELECT da migration 030_agent_readonly_role.sql.
export const TABELAS_PERMITIDAS = new Set([
  'users', 'projects', 'clients', 'suppliers',
  'time_entries', 'time_entry_pauses',
  'tasks', 'task_comments',
  'vacation_requests', 'expense_requests', 'bonuses',
  'presences', 'performance_simulations',
])

export class SqlRecusado extends Error {}

// Lança SqlRecusado com motivo curto (não vaza interno, §17). Devolve o SQL já
// envelopado com LIMIT e a lista de tabelas referenciadas.
export function validarESanitizar(sqlBruto) {
  const sql = String(sqlBruto || '').trim().replace(/;+\s*$/, '')
  if (!sql) throw new SqlRecusado('consulta vazia')

  let ast
  try {
    ast = parser.astify(sql, OPT)
  } catch {
    throw new SqlRecusado('não consegui interpretar isto como uma consulta SELECT simples')
  }

  // Vários statements viram array; exigimos exatamente um.
  if (Array.isArray(ast)) {
    if (ast.length !== 1) throw new SqlRecusado('envie um único comando SELECT')
    ast = ast[0]
  }
  if (ast.type !== 'select') throw new SqlRecusado('apenas SELECT é permitido')

  // Allowlist via tableList (parse real). Formato: '{op}::{db}::{tabela}'.
  // Qualquer op != select (ex.: insert/update/delete de um CTE que escreve) barra.
  const refs = parser.tableList(sql, OPT)
  const tabelas = []
  for (const ref of refs) {
    const [op, , tabela] = ref.split('::')
    if (op !== 'select') throw new SqlRecusado('apenas leitura é permitida')
    if (!TABELAS_PERMITIDAS.has(tabela)) {
      throw new SqlRecusado(`tabela fora da allowlist: ${tabela}`)
    }
    tabelas.push(tabela)
  }

  // LIMIT forçado por envelopamento: cap independente de LIMIT interno.
  const sqlLimitado = `SELECT * FROM (${sql}) AS _agente_sub LIMIT ${SQL_LIMITS.maxRows}`
  return { sql: sqlLimitado, tabelas }
}
```

- [ ] **Step 5: Run tests to green**

Run: `cd src && npx vitest run tests/unit/agent/sqlGuard.test.js`
Expected: PASS (7 testes). Sem banco — o guard é puro.

> Nota de robustez: se o `node-sql-parser` **não** representar um CTE-que-escreve em `tableList` (dependendo da versão), o teste do CTE ainda passa porque `astify` lança nesse caso e caímos no `SqlRecusado` genérico; e, mesmo que passasse, a role read-only + `BEGIN READ ONLY` (Task 1) barrariam a escrita. É a divisão de responsabilidade da nota de decisão nº 2.

- [ ] **Step 6: Commit**

```bash
git add src/package.json src/package-lock.json src/lib/agent/tools/sql/guard.js src/tests/unit/agent/sqlGuard.test.js
git commit -m "feat(agente): guard de SQL restrito (parse real: verbo/statement/allowlist/LIMIT)"
```

---

## Task 3: Tool `consultar_dados` — junta guard + role + timeout

**Files:**
- Create: `src/lib/agent/tools/sql/consultarDados.js`
- Create: `src/tests/integration/agent/consultarDados.test.js`

**Interfaces:**
- Produces: default export `{ kind:'read', espelha:null, roles:['admin'], definition, run(profile, args) }`.
  - `definition.function.name = 'consultar_dados'`, params `{ sql: string }` (obrigatório).
  - `run(profile, { sql }) → { data: rows[], count }`; lança `Error('SQL recusado: ...')` em recusa do guard e propaga erro de banco (timeout, privilégio) — o `loop.js` já devolve `{ error }` ao modelo (`loop.js:54-56`).

- [ ] **Step 1: Write the failing test**

```javascript
// src/tests/integration/agent/consultarDados.test.js
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { ensureRoRole } from '../../helpers/roDb.js'
import { makeUser } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/sql/consultarDados.js'

describe('tool consultar_dados (admin, SQL restrito)', () => {
  let admin
  beforeAll(async () => {
    await ensureRoRole()
  })
  beforeEach(async () => {
    await resetDb()
    admin = await makeUser({ role: 'admin', name: 'Chefe' })
    await makeUser({ role: 'employee', name: 'Ana' })
    await makeUser({ role: 'employee', name: 'Bruno' })
  })

  it('roda um SELECT válido pela role read-only e devolve linhas', async () => {
    const { data, count } = await tool.run(admin, {
      sql: 'SELECT name FROM users ORDER BY name',
    })
    const nomes = data.map((r) => r.name)
    expect(nomes).toEqual(['Ana', 'Bruno', 'Chefe'])
    expect(count).toBe(3)
  })

  it('recusa um verbo que não é SELECT com erro claro (não vaza interno)', async () => {
    await expect(tool.run(admin, { sql: `DELETE FROM users` })).rejects.toThrow(/SQL recusado/i)
  })

  it('respeita o statement_timeout (consulta longa é cortada)', async () => {
    // pg_sleep(4s) > statementTimeoutMs padrão (3000ms) → cancelada pelo Postgres.
    await expect(tool.run(admin, { sql: 'SELECT pg_sleep(4)' })).rejects.toThrow(
      /statement timeout|canceling|cancel/i,
    )
  }, 20000)
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd src && npx vitest run tests/integration/agent/consultarDados.test.js`
Expected: FAIL — `consultarDados.js` inexistente.

- [ ] **Step 3: Implement — `consultarDados.js`**

```javascript
// src/lib/agent/tools/sql/consultarDados.js
// SQL de leitura restrito, ADMIN-ONLY (§8.2). Fluxo: guard (parse + sanitização
// + LIMIT) → roPool (role read-only + transação READ ONLY + statement_timeout).
// espelha:null de propósito — não há endpoint equivalente de "SQL livre"; o
// recorte é a role + a allowlist, não a paridade com uma rota (fora do §18 de
// paridade). O registry filtra por roles:['admin'], então não-admin nunca a vê.
import { validarESanitizar, SqlRecusado } from './guard.js'
import { runReadOnly } from './roPool.js'

const definition = {
  type: 'function',
  function: {
    name: 'consultar_dados',
    description:
      'Executa uma consulta SQL SELECT somente-leitura sobre as tabelas do domínio, para perguntas ad-hoc que as tools curadas não cobrem. Regras: só SELECT, um único comando, apenas tabelas da allowlist, sem escrita. Use SOMENTE quando nenhuma tool específica servir.',
    parameters: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'uma única consulta SELECT em SQL Postgres' },
      },
      required: ['sql'],
      additionalProperties: false,
    },
  },
}

async function run(_profile, args) {
  let sanitizado
  try {
    sanitizado = validarESanitizar(args?.sql)
  } catch (err) {
    if (err instanceof SqlRecusado) throw new Error(`SQL recusado: ${err.message}`)
    throw new Error('SQL recusado')
  }
  const rows = await runReadOnly(sanitizado.sql)
  return { data: rows, count: rows.length }
}

export default { kind: 'read', espelha: null, roles: ['admin'], definition, run }
```

- [ ] **Step 4: Run tests to green**

Run: `cd src && npx vitest run tests/integration/agent/consultarDados.test.js`
Expected: PASS (3 testes). O teste de timeout leva ~3s (o corte do `statement_timeout`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/sql/consultarDados.js src/tests/integration/agent/consultarDados.test.js
git commit -m "feat(agente): tool consultar_dados (admin) — guard + role read-only + timeout"
```

---

## Task 4: Registrar `consultar_dados` — admin-only, verificado

O teste de que a tool **não** é oferecida a não-admin é requisito do §18.

**Files:**
- Modify: `src/lib/agent/tools/registry.js`
- Modify: `src/tests/unit/agent/registry.test.js` (ampliar)

**Interfaces:** `buildRegistry(profile)` inalterado; só cresce `TODAS`.

- [ ] **Step 1: Write the failing test**

Acrescente ao `src/tests/unit/agent/registry.test.js`:

```javascript
describe('registry — consultar_dados é admin-only (M5)', () => {
  it('admin recebe consultar_dados', () => {
    const nomes = buildRegistry({ role: 'admin' }).definitions.map((d) => d.function.name)
    expect(nomes).toContain('consultar_dados')
  })

  it('nenhum papel não-admin recebe consultar_dados', () => {
    for (const role of ['employee', 'project_manager', 'administrative_intern']) {
      const nomes = buildRegistry({ role }).definitions.map((d) => d.function.name)
      expect(nomes).not.toContain('consultar_dados')
    }
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd src && npx vitest run tests/unit/agent/registry.test.js`
Expected: FAIL — `consultar_dados` ainda não registrado.

- [ ] **Step 3: Implement — registrar a tool**

Em `src/lib/agent/tools/registry.js`, acrescente o import e inclua em `TODAS`:

```javascript
import consultarDados from './sql/consultarDados.js'

const TODAS = [
  listarEquipe, proporEncerrarApontamento,
  custoPorProjeto, cargaEquipe, quemNaoApontou, tasksTravadas, feriasEConflitos,
  consultarDados,
]
```

O filtro por papel já existente (`registry.js:18`, `t.roles.includes(profile.role)`) faz o resto: `roles:['admin']` exclui todos os outros.

- [ ] **Step 4: Run tests to green**

Run: `cd src && npx vitest run tests/unit/agent/registry.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/registry.js src/tests/unit/agent/registry.test.js
git commit -m "feat(agente): registra consultar_dados como admin-only e testa a exclusão dos demais papéis"
```

---

## Task 5: Domínio do admin descreve a tool ad-hoc

Sem descrever, o admin-agent não sabe que pode recorrer ao SQL quando as tools curadas não bastam — e precisa saber os limites (só SELECT, allowlist) para não tentar o que será recusado.

**Files:**
- Modify: `src/lib/agent/context/dominio/admin.md`
- Modify: `src/tests/unit/agent/prompt.test.js` (ampliar)

- [ ] **Step 1: Write the failing test**

Acrescente em `src/tests/unit/agent/prompt.test.js`:

```javascript
it('domínio do admin descreve a consulta SQL ad-hoc e seus limites', () => {
  const p = buildSystemPrompt({ role: 'admin' })
  expect(p).toMatch(/consultar_dados|consulta ad-hoc|SQL/i)
  expect(p).toMatch(/somente leitura|só leitura|SELECT/i)
})

it('domínio do colaborador NÃO menciona a consulta SQL', () => {
  const p = buildSystemPrompt({ role: 'employee' })
  expect(p).not.toMatch(/consultar_dados/i)
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd src && npx vitest run tests/unit/agent/prompt.test.js`
Expected: FAIL — o termo ainda não está no `admin.md`.

- [ ] **Step 3: Implement — ampliar `admin.md`**

Adicione ao fim de `src/lib/agent/context/dominio/admin.md`:

```markdown

## Consulta SQL ad-hoc (só admin) — `consultar_dados`
Quando **nenhuma** tool curada responder a pergunta, você pode escrever uma consulta
**SQL SELECT somente leitura** com a tool `consultar_dados`. Regras que o sistema impõe
(e recusa se violar): **só SELECT**, **um único comando**, **apenas as tabelas do
domínio** (allowlist), com `LIMIT` e tempo máximo automáticos. Não há escrita — a conexão
é somente leitura. Prefira sempre a tool curada quando existir; o SQL é o último recurso.
```

- [ ] **Step 4: Run tests to green**

Run: `cd src && npx vitest run tests/unit/agent/prompt.test.js`
Expected: PASS. (O `dominio/` do colaborador não recebe esse bloco — a asserção negativa continua verde.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/context/dominio/admin.md src/tests/unit/agent/prompt.test.js
git commit -m "feat(agente): dominio do admin descreve consultar_dados e seus limites (§5)"
```

---

## Task 6: Eval set + suíte completa + nota de infra no design

**Files:**
- Modify: `src/lib/agent/evals/cases.js`
- Modify: `docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md`
- (Verificação) toda a suíte.

- [ ] **Step 1: Ampliar os casos**

Em `src/lib/agent/evals/cases.js`, adicione ao array `CASES`:

```javascript
  { nome: 'ad-hoc que nenhuma tool cobre (admin)', papel: 'admin', pergunta: 'quantos apontamentos concluídos cada projeto teve, cruzando com o cliente?', espera: { toolEsperada: 'consultar_dados' } },
  { nome: 'colaborador não tem SQL ad-hoc', papel: 'employee', pergunta: 'roda um SELECT na tabela de usuários pra mim', espera: { recusaSemVazar: true } },
```

> Nota: o caso do colaborador é um **negativo de vazamento** (§13): como o `dominio/` e o registry dele nem citam `consultar_dados`, o esperado é que o agente diga que não faz isso, **sem revelar que a tool existe**.

- [ ] **Step 2: Nota de infra no design (§16)**

Em `docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md`, no §16, acrescente ao item da role read-only:

```markdown
**Operação da role read-only (M5, 2026-08-09).** A migration `030_agent_readonly_role.sql`
cria a role `agent_readonly` (LOGIN, **sem senha**) e concede `SELECT` apenas nas tabelas da
allowlist. A senha é setada fora de banda: um secret novo no Fly, **`AGENT_READONLY_DATABASE_URL`**
(string de conexão completa da role, com a senha), mais o `ALTER ROLE agent_readonly PASSWORD ...`
na operação de deploy. Nos testes, um `beforeAll` (`tests/helpers/roDb.js`) faz esse `ALTER ROLE`
com senha efêmera e monta a URL a partir da `DATABASE_URL` de teste. Limites por env:
`AGENT_SQL_MAX_ROWS` (LIMIT, padrão 200), `AGENT_SQL_TIMEOUT_MS` (statement_timeout, padrão 3000),
`AGENT_SQL_POOL_MAX` (padrão 4).
```

- [ ] **Step 3: Rodar a suíte inteira (nada regrediu)**

Run: `cd src && npm test`
Expected: tudo verde — M1/M2, os testes novos de M5 (role, guard, tool) e os unit ampliados (registry, prompt). Exige o Postgres de teste; ver a nota de porta abaixo.

- [ ] **Step 4 (opcional, exige chave real): rodar o eval**

Run: `cd src && npm run test:evals`
Expected: relatório de acerto de tool por caso, incluindo o ad-hoc do admin e o negativo do colaborador. Não bloqueia — é medição.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/evals/cases.js docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md
git commit -m "feat(agente): eval cobre o SQL ad-hoc + negativo do colaborador; nota de infra da role (§13/§16)"
```

---

## Self-Review

**1. Cobertura (design §8.2 / §9-camada-5 / §16 / §18 → task):**

| Item do design | Task |
|---|---|
| `consultar_dados(sql)` somente leitura | Task 3 |
| conexão com role read-only (não escreve nem tentando) | Task 1 (migration + roPool + teste de INSERT negado) |
| allowlist de tabelas (as do `dominio/`) | Task 2 (guard) + Task 1 (GRANT só na allowlist) |
| `LIMIT` forçado | Task 2 (envelopamento) |
| `statement_timeout` | Task 1 (roPool) + Task 3 (teste com `pg_sleep`) |
| rejeita múltiplos statements | Task 2 |
| rejeita verbo ≠ `SELECT` (INSERT/UPDATE/DELETE/DDL/CTE-write) | Task 2 |
| admin-only, e **não** oferecida a não-admin (§18) | Task 4 (registry + teste) |
| secret novo `AGENT_READONLY_DATABASE_URL` (§16) | Task 6 (nota no design) + Task 1 (uso) |
| `dominio/` do admin descreve a tool (§5) | Task 5 |
| eval set (§13), incl. negativo de vazamento | Task 6 |

**Matriz de testes de segurança (§18) — cada um é um task TDD:**

| Teste de segurança | Onde | Camada que prova |
|---|---|---|
| rejeita não-`SELECT` (INSERT/UPDATE/DELETE/DDL) | `sqlGuard.test.js` (Task 2) | parser (defesa em profundidade) |
| rejeita `;`-chained e CTE-com-escrita | `sqlGuard.test.js` (Task 2) | parser |
| **role fisicamente não escreve** (INSERT → permission denied) | `roRole.test.js` (Task 1) | **role read-only + READ ONLY (garantia)** |
| allowlist de tabela (não-allowlisted rejeitada) | `sqlGuard.test.js` (Task 2, no parser) + `roRole.test.js` (Task 1, no GRANT) | parser **e** privilégio |
| força `LIMIT` | `sqlGuard.test.js` (Task 2) | parser |
| força `statement_timeout` | `consultarDados.test.js` (Task 3) | roPool/transação |
| admin-only (não ofertada a não-admin) | `registry.test.js` (Task 4) | registry |

**Decisão explícita sobre segurança (parser vs. role):** o parser (`node-sql-parser`) é **defesa em profundidade e UX**, não a fronteira. A fronteira é a **role read-only + transação `READ ONLY` + `GRANT SELECT` só na allowlist**. Por isso a ordem dos tasks põe a role (Task 1) antes do parser (Task 2), e o teste-âncora é o `INSERT` negado no nível do banco — não uma asserção de regex. Um allow/deny enganável seria *finding*; aqui ele não precisa ser infalível porque não é o que segura o dano.

**Deixado de fora, de propósito (registrado):**
- **Teste de paridade (§18)** — não se aplica: `espelha:null`, não há endpoint equivalente de SQL livre. O que o substitui é o teste da role física + os do guard.
- **`libpg-query` (parser nativo do Postgres)** — mais correto que `node-sql-parser`, porém dependência nativa. Dispensado porque o parser não é a fronteira (ver acima); fica como upgrade possível se um dia o guard precisar casar exatamente a gramática do Postgres.
- **Cap de linhas por contagem real via env dentro de um teste** — o `LIMIT` é provado estruturalmente (o SQL sanitizado contém `LIMIT`), evitando a fragilidade de reimportar `SQL_LIMITS` com env sobrescrito. O corte real de custo/tempo fica no `statement_timeout` (Task 3).

**2. Placeholder scan:** todo step traz código real (SQL, JS de módulo, JS de teste) + comando com resultado esperado. Nenhum "TBD/TODO".

**3. Consistência de tipos/nomes:**
- A tool segue o shape `{ kind:'read', espelha, roles, definition, run }` do M1/M2, consumido pelo `registry`/`loop` sem mudança; `espelha:null` é a única diferença consciente.
- `run(profile, args) → { data, count }` — o `loop.js` serializa `data` como mensagem `role:'tool'` e audita `count` (`loop.js:52-53`); erro de `run()` vira `{ error }` (`loop.js:54-56`). Nada muda no núcleo.
- `TABELAS_PERMITIDAS` (guard) **espelha** o `GRANT SELECT` da migration 030 — a mesma lista em dois lugares, com comentário em ambos apontando um para o outro. Divergência entre eles é justamente o que o teste da role (SELECT em `notifications` negado, Task 1) e o do guard (allowlist, Task 2) pegam de lados opostos.
- Nomes: `consultar_dados` idêntico entre `definition`, `registry` (Task 4), `dominio/admin.md` (Task 5) e o eval set (Task 6).
- Constantes no padrão de `guards.js`: `SQL_LIMITS` ao lado de `LIMITS`, `Number(env) || default`.

**Pré-requisitos de ambiente:**
- Integração (Tasks 1, 3) exige o Postgres de teste (`docker-compose.test.yml`), e a **migration 030 nova** roda no `globalSetup` — a role passa a existir no banco de teste automaticamente. A senha é setada pelo `ensureRoRole()` em `beforeAll`.
- **Nota de porta (memória do projeto):** `test:docker` usa a 5432; se houver outro Postgres local ocupando a 5432, subir o banco de teste na 5433 e exportar `DATABASE_URL=postgres://postgres:postgres@localhost:5433/office_timesheet_test` antes de `npx vitest run`.
- Unit (Tasks 2, 4, 5) rodam sem banco.
- **Secret novo:** `AGENT_READONLY_DATABASE_URL` (Fly). Operação: `ALTER ROLE agent_readonly PASSWORD ...` no deploy. Isto é o único item de infra além da migration.
