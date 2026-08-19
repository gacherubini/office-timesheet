# Bloco A1 — Usuários online e marca na aba — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O indicador da home passa a mostrar quem está online agora (não quantos usuários existem), e a aba do navegador ganha o símbolo da marca e o título da página aberta.

**Architecture:** Presença vive num `Map` em memória no processo da API, carimbado pelo `requireAuth` que já roda em toda request autenticada, mais um heartbeat de 60s do front. O `GET /dashboard` une esse conjunto com quem tem cronômetro rodando. Do lado do front, os ícones saem do símbolo da marca que já existe no repo, e o título da aba é ligado dentro do `PageHeader`, que 19 páginas já usam.

**Tech Stack:** Node 20 / Express 5, node-postgres, Vitest + Supertest (API); React 19, Vite, Vitest + Testing Library (web); `sips` (macOS) para redimensionar PNG.

**Spec:** `docs/superpowers/specs/2026-08-18-ajustes-void-a-interface-design.md` (itens 9 e 10)

## Global Constraints

- **Zero migration.** Nenhuma tarefa deste plano toca o schema. Se você sentir vontade de criar coluna, pare e releia o §3 da visão geral.
- **`requireAuth` não pode ganhar I/O.** Ele hoje faz zero queries em cache hit; é o motivo de o `lib/userCache.js` existir. Nada de `await` novo no caminho dele.
- **Janela de online:** 5 minutos.
- **Intervalo do heartbeat:** 60 segundos, e só com `document.visibilityState === 'visible'`.
- **Sufixo do título:** `Gestão VOID`, separador ` · ` (espaço, ponto médio U+00B7, espaço).
- **`kpis.active_users` e `kpis.total_users` continuam no payload.** `online_users` é acréscimo, não substituição — outro consumidor pode estar lendo.
- Comentários e mensagens em **português**, como o resto do repo.
- Banco de teste local: a porta 5432 costuma estar ocupada por outro container. Use `DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test"` com um Postgres na 5433.

---

### Task 1: `lib/onlineUsers.js` — o registro de quem está online

**Files:**
- Create: `src/lib/onlineUsers.js`
- Test: `src/tests/unit/onlineUsers.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `marcarVisto(userId: string): void`, `usuariosOnline(): Set<string>`, `limparOnline(): void`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/unit/onlineUsers.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { marcarVisto, usuariosOnline, limparOnline } from '../../lib/onlineUsers.js'

describe('onlineUsers', () => {
  const prevJanela = process.env.PRESENCE_WINDOW_MS

  beforeEach(() => {
    limparOnline()
    delete process.env.PRESENCE_WINDOW_MS
  })

  afterEach(() => {
    vi.useRealTimers()
    if (prevJanela === undefined) delete process.env.PRESENCE_WINDOW_MS
    else process.env.PRESENCE_WINDOW_MS = prevJanela
  })

  it('quem foi marcado aparece em usuariosOnline()', () => {
    marcarVisto('u1')
    expect(usuariosOnline().has('u1')).toBe(true)
  })

  it('quem nunca foi marcado não aparece', () => {
    marcarVisto('u1')
    expect(usuariosOnline().has('u2')).toBe(false)
  })

  it('some depois da janela de 5 minutos', () => {
    vi.useFakeTimers()
    marcarVisto('u1')
    vi.advanceTimersByTime(5 * 60_000 + 1)
    expect(usuariosOnline().has('u1')).toBe(false)
  })

  it('continua dentro da janela e o sinal novo renova', () => {
    vi.useFakeTimers()
    marcarVisto('u1')
    vi.advanceTimersByTime(4 * 60_000)
    expect(usuariosOnline().has('u1')).toBe(true)
    marcarVisto('u1')
    vi.advanceTimersByTime(4 * 60_000)
    expect(usuariosOnline().has('u1')).toBe(true)
  })

  // A poda preguiçosa é o que impede o Map de crescer para sempre num processo
  // que fica meses de pé. Sem ela, todo usuário que já logou uma vez ficaria
  // guardado — e o vazamento só apareceria em produção, muito depois.
  it('poda o vencido do Map, não só do resultado', () => {
    vi.useFakeTimers()
    marcarVisto('u1')
    vi.advanceTimersByTime(5 * 60_000 + 1)
    usuariosOnline() // dispara a poda
    // Volta no tempo: se o registro ainda estivesse no Map, ele reapareceria.
    vi.setSystemTime(new Date(Date.now() - 5 * 60_000))
    expect(usuariosOnline().has('u1')).toBe(false)
  })

  it('a janela é lida em call-time via PRESENCE_WINDOW_MS', () => {
    vi.useFakeTimers()
    process.env.PRESENCE_WINDOW_MS = '1000'
    marcarVisto('u1')
    vi.advanceTimersByTime(1001)
    expect(usuariosOnline().has('u1')).toBe(false)
  })

  it('id vazio não cria entrada', () => {
    marcarVisto(undefined)
    marcarVisto(null)
    marcarVisto('')
    expect(usuariosOnline().size).toBe(0)
  })

  it('limparOnline zera tudo', () => {
    marcarVisto('u1')
    limparOnline()
    expect(usuariosOnline().size).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src && npx vitest run tests/unit/onlineUsers.test.js
```

Expected: FAIL — `Failed to resolve import "../../lib/onlineUsers.js"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/onlineUsers.js`:

```js
// Presença ao vivo: quem deu sinal nos últimos minutos. Alimenta o indicador
// "usuários online" da home (GET /dashboard).
//
// Por que memória e não coluna em users: requireAuth faz ZERO queries em cache
// hit — é exatamente o motivo de lib/userCache.js existir. Um UPDATE por
// request pegaria lock de linha na tabela mais lida do sistema para alimentar
// um número na tela. Ver §3 de docs/superpowers/specs/2026-08-18-ajustes-void-visao-geral.md.
//
// Ressalva de escala (a mesma que o userCache.js já carrega): com mais de uma
// máquina no Fly, cada instância teria seu próprio Map e o número sairia MENOR
// que o real. Hoje min_machines_running = 1 e auto_stop_machines = off. Se um
// dia escalar, isto vira tabela — e o userCache também.
//
// Custo aceito: zera no deploy e repopula em segundos, conforme as pessoas
// fazem requests. Não há histórico e não deve haver.
//
// NOME: "onlineUsers" e não "presence" porque routes/presences.js e a tabela
// `presences` (migration 028) são OUTRA COISA — a marcação de "vou ao
// escritório amanhã" da Agenda. Dois conceitos quase homônimos no mesmo repo
// seria armadilha para quem chegar depois.

// Lido em call-time de propósito, para o teste poder encurtar a janela sem
// depender da ordem de import (mesmo padrão do serveDisabled() no userCache).
function janelaMs() {
  return Number(process.env.PRESENCE_WINDOW_MS) || 5 * 60_000
}

const vistos = new Map() // userId -> epoch ms do último sinal

export function marcarVisto(userId) {
  if (userId) vistos.set(userId, Date.now())
}

// Poda preguiçosa: remove os vencidos no mesmo passo em que monta o resultado.
// Com dezenas de usuários não compensa um timer, e sem a poda o Map cresceria
// para sempre num processo de vida longa.
export function usuariosOnline() {
  const limite = Date.now() - janelaMs()
  const ativos = new Set()
  for (const [userId, visto] of vistos) {
    if (visto > limite) ativos.add(userId)
    else vistos.delete(userId)
  }
  return ativos
}

// Reset entre testes (ver tests/helpers/db.js), espelhando clearUserCache().
export function limparOnline() {
  vistos.clear()
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd src && npx vitest run tests/unit/onlineUsers.test.js
```

Expected: PASS, 8 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/onlineUsers.js src/tests/unit/onlineUsers.test.js
git commit -m "feat(api): registro de presença em memória para usuários online"
```

---

### Task 2: Carimbo no `requireAuth` e o endpoint de heartbeat

**Files:**
- Modify: `src/middleware/auth.js` (import + uma linha antes de `next()`)
- Modify: `src/routes/me.js` (nova rota)
- Modify: `src/tests/helpers/db.js` (reset entre testes)
- Test: `src/tests/integration/onlineUsers.test.js`

**Interfaces:**
- Consumes: `marcarVisto`, `online`, `limparOnline` da Task 1.
- Produces: `POST /me/heartbeat` → `204` sem corpo.

- [ ] **Step 1: Adicionar o reset de presença ao helper de teste**

Em `src/tests/helpers/db.js`, o `resetDb()` já limpa o cache de usuário. Presença tem o mesmo problema — vive no processo e sobrevive entre testes.

Troque o import e o fim da função:

```js
import { clearUserCache } from '../../lib/userCache.js'
import { limparOnline } from '../../lib/onlineUsers.js'
```

e, logo depois de `clearUserCache()`:

```js
  // Presença também vive no processo: sem limpar, um usuário marcado num teste
  // anterior contaria como online no seguinte.
  limparOnline()
```

- [ ] **Step 2: Write the failing test**

Create `src/tests/integration/onlineUsers.test.js`:

```js
// O sinal de presença sai do requireAuth, não de cada rota — então qualquer
// request autenticada marca, e o heartbeat existe só para a aba parada não
// sumir do indicador.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../helpers/db.js'
import { asUser, request } from '../helpers/api.js'
import { makeUser } from '../helpers/factories.js'
import { usuariosOnline } from '../../lib/onlineUsers.js'

describe('presença — heartbeat e carimbo do requireAuth', () => {
  let emp
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee', name: 'Ana' })
  })

  it('POST /me/heartbeat responde 204 sem corpo', async () => {
    const res = await asUser(emp).post('/me/heartbeat')
    expect(res.status).toBe(204)
    expect(res.text).toBe('')
  })

  it('o heartbeat deixa o usuário online', async () => {
    expect(usuariosOnline().has(emp.id)).toBe(false)
    await asUser(emp).post('/me/heartbeat')
    expect(usuariosOnline().has(emp.id)).toBe(true)
  })

  it('qualquer request autenticada também marca presença', async () => {
    expect(usuariosOnline().has(emp.id)).toBe(false)
    await asUser(emp).get('/me')
    expect(usuariosOnline().has(emp.id)).toBe(true)
  })

  it('request sem token não marca ninguém', async () => {
    await request.post('/me/heartbeat')
    expect(usuariosOnline().size).toBe(0)
  })

  // Quem levou 403 não está usando o sistema — está sendo barrado por ele.
  it('usuário inativo (403) não é marcado como online', async () => {
    const inativo = await makeUser({ role: 'employee', name: 'Bloqueado', is_active: false })
    const res = await asUser(inativo).get('/me')
    expect(res.status).toBe(403)
    expect(usuariosOnline().has(inativo.id)).toBe(false)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/onlineUsers.test.js
```

Expected: FAIL — o heartbeat devolve 404 (rota não existe) e `usuariosOnline()` fica vazio.

- [ ] **Step 4: Carimbar no `requireAuth`**

Em `src/middleware/auth.js`, adicione ao topo:

```js
import { marcarVisto } from '../lib/onlineUsers.js'
```

e, no fim do `try`, imediatamente antes de `next()`:

```js
    req.accessToken = token
    req.authUser = { id: profile.id, email: profile.email }
    req.profile = profile
    // Presença: depois de todas as guardas, para que 401/403 não conte como
    // "online". É um Map.set em memória — nada de I/O neste caminho.
    marcarVisto(profile.id)
    next()
```

- [ ] **Step 5: Criar o endpoint**

Em `src/routes/me.js`, logo depois da rota `GET /me`:

```js
// Sinal de vida da aba aberta, para o indicador "usuários online".
// O handler é vazio DE PROPÓSITO: quem carimba a presença é o requireAuth que
// esta rota atravessa (ver lib/onlineUsers.js). Não apague achando que é rota
// morta — sem ela, quem fica lendo uma tela que não faz polling some do
// indicador em 5 minutos, sentado na cadeira.
router.post('/me/heartbeat', requireAuth, (_req, res) => res.status(204).end())
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/onlineUsers.test.js
```

Expected: PASS, 5 testes.

- [ ] **Step 7: Commit**

```bash
git add src/middleware/auth.js src/routes/me.js src/tests/helpers/db.js src/tests/integration/onlineUsers.test.js
git commit -m "feat(api): heartbeat e carimbo de presença no requireAuth"
```

---

### Task 3: `online_users` no `GET /dashboard`

**Files:**
- Modify: `src/routes/dashboard.js`
- Test: `src/tests/integration/dashboardOnline.test.js`

**Interfaces:**
- Consumes: `usuariosOnline()` da Task 1.
- Produces: `kpis.online_users: number` na resposta de `GET /dashboard`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/integration/dashboardOnline.test.js`:

```js
// "Online" tem duas fontes: sinal recente (request/heartbeat) e cronômetro
// rodando. A segunda existe porque quem está com o timer aberto está
// trabalhando, mesmo que a aba não mande request nenhuma.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin, makeProject, makeRunningEntry } from '../helpers/factories.js'
import { limparOnline } from '../../lib/onlineUsers.js'

const PERIODO = '?start_date=2026-08-01&end_date=2026-08-31'

describe('GET /dashboard — usuários online', () => {
  let admin
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
  })

  it('conta quem deu heartbeat', async () => {
    const emp = await makeUser({ role: 'employee', name: 'Ana' })
    await asUser(emp).post('/me/heartbeat')

    const res = await asUser(admin).get(`/dashboard${PERIODO}`)
    expect(res.status).toBe(200)
    // O próprio admin conta: a request dele passou pelo requireAuth.
    expect(res.body.kpis.online_users).toBe(2)
  })

  it('não conta quem não deu sinal nenhum', async () => {
    await makeUser({ role: 'employee', name: 'Fantasma' })

    const res = await asUser(admin).get(`/dashboard${PERIODO}`)
    expect(res.body.kpis.online_users).toBe(1) // só o admin da request
  })

  it('conta quem tem cronômetro rodando mesmo sem request recente', async () => {
    const emp = await makeUser({ role: 'employee', name: 'Ana' })
    const proj = await makeProject({ name: 'Obra' })
    await makeRunningEntry({
      user_id: emp.id,
      project_id: proj.id,
      started_at: new Date().toISOString(),
    })
    // Zera a presença: a Ana não fez request nenhuma, só tem o timer aberto.
    limparOnline()

    const res = await asUser(admin).get(`/dashboard${PERIODO}`)
    expect(res.body.kpis.online_users).toBe(2) // Ana pelo timer + admin pela request
  })

  it('não conta duas vezes quem tem timer E sinal recente', async () => {
    const emp = await makeUser({ role: 'employee', name: 'Ana' })
    const proj = await makeProject({ name: 'Obra' })
    await makeRunningEntry({
      user_id: emp.id,
      project_id: proj.id,
      started_at: new Date().toISOString(),
    })
    await asUser(emp).post('/me/heartbeat')

    const res = await asUser(admin).get(`/dashboard${PERIODO}`)
    expect(res.body.kpis.online_users).toBe(2)
  })

  it('usuário desativado não conta como online', async () => {
    const inativo = await makeUser({ role: 'employee', name: 'Desligado', is_active: false })
    const proj = await makeProject({ name: 'Obra' })
    await makeRunningEntry({
      user_id: inativo.id,
      project_id: proj.id,
      started_at: new Date().toISOString(),
    })

    const res = await asUser(admin).get(`/dashboard${PERIODO}`)
    expect(res.body.kpis.online_users).toBe(1)
  })

  it('active_users e total_users continuam no payload', async () => {
    const res = await asUser(admin).get(`/dashboard${PERIODO}`)
    expect(res.body.kpis.active_users).toBeTypeOf('number')
    expect(res.body.kpis.total_users).toBeTypeOf('number')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/dashboardOnline.test.js
```

Expected: FAIL — `expected undefined to be 2` (`online_users` não existe).

- [ ] **Step 3: Implementar**

Em `src/routes/dashboard.js`, adicione o import:

```js
import { usuariosOnline } from '../lib/onlineUsers.js'
```

No `Promise.all`, acrescente uma quarta query e o destructuring correspondente:

```js
    const [
      { rows: entries },
      { rows: profiles },
      { rows: projects },
      { rows: running },
    ] = await Promise.all([
```

e, como último item do array (depois da query de `projects`):

```js
      query(`SELECT DISTINCT user_id FROM time_entries WHERE status = 'running'`),
```

Depois, junto do cálculo de `activeUsers` (procure por `const activeUsers =`), adicione:

```js
    // "Online" = sinal recente no processo (request ou heartbeat) OU cronômetro
    // rodando. O Set já deduplica quem satisfaz os dois. O filtro por is_active
    // evita contar quem foi desligado mas ainda tinha um timer aberto.
    const idsOnline = usuariosOnline()
    for (const r of running || []) idsOnline.add(r.user_id)
    const onlineUsers = (profiles || []).filter((p) => p.is_active && idsOnline.has(p.id)).length
```

E no objeto `kpis`, logo depois de `total_users`:

```js
        online_users: onlineUsers,
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run tests/integration/dashboardOnline.test.js
```

Expected: PASS, 6 testes.

- [ ] **Step 5: Rodar a suíte inteira**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run
```

Expected: PASS. A baseline antes deste plano era **131 arquivos, 838 testes**. Agora devem ser 133 arquivos e 857 testes. Se algum teste ANTIGO quebrar, quase certamente é presença vazando entre testes — confira o Step 1 da Task 2.

- [ ] **Step 6: Commit**

```bash
git add src/routes/dashboard.js src/tests/integration/dashboardOnline.test.js
git commit -m "feat(api): kpis.online_users une presença recente e cronômetro rodando"
```

---

### Task 4: Heartbeat no front e o KPI na tela

**Files:**
- Modify: `web/src/components/Layout.jsx`
- Modify: `web/src/pages/admin/AdminDashboardPage.jsx:357-363`

**Interfaces:**
- Consumes: `POST /me/heartbeat` (Task 2) e `kpis.online_users` (Task 3).
- Produces: nada para tarefas seguintes.

- [ ] **Step 1: Adicionar o heartbeat ao Layout**

`web/src/components/Layout.jsx` inteiro passa a ser:

```jsx
import { useEffect } from 'react'
import { Topbar } from './Topbar'
import { ClockInReminder } from './ClockInReminder'
import { api } from '../lib/api'

const HEARTBEAT_MS = 60_000

export function Layout({ children }) {
  // Sinal de vida para o indicador "usuários online" (src/lib/onlineUsers.js).
  // Só com a aba visível: aba aberta no fundo durante o almoço não é presença.
  // Falha em silêncio — perder um heartbeat não pode virar erro na tela.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') {
        api.post('/me/heartbeat').catch(() => {})
      }
    }, HEARTBEAT_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <Topbar />
      <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
      <ClockInReminder />
    </div>
  )
}
```

- [ ] **Step 2: Trocar o KPI**

Em `web/src/pages/admin/AdminDashboardPage.jsx`, substitua o bloco de "Usuários ativos":

```jsx
          <div>
            <p className="text-[9px] uppercase tracking-[.2em] text-white/60">Usuários ativos</p>
            <p className="mt-2 font-display text-2xl font-light leading-none tabular-nums">
              {loading ? '—' : `${kpis?.active_users ?? 0} de ${kpis?.total_users ?? 0}`}
            </p>
          </div>
```

por:

```jsx
          <div>
            <p className="text-[9px] uppercase tracking-[.2em] text-white/60">Usuários online</p>
            <p className="mt-2 font-display text-2xl font-light leading-none tabular-nums">
              {loading ? '—' : (kpis?.online_users ?? 0)}
            </p>
          </div>
```

Sem o "de N": online não tem denominador. O rótulo antigo mentia — `active_users` era `is_active`, ou seja, quantos usuários não estão desativados no cadastro, nada a ver com quem está usando o sistema.

- [ ] **Step 3: Verificar que o front continua verde**

```bash
cd web && npx vitest run
```

Expected: PASS, 17 arquivos / 137 testes (nenhum teste novo aqui — os dois arquivos alterados não têm cobertura de teste no repo, e criar uma para um `setInterval` daria mais manutenção que valor; o comportamento está coberto pelos testes de API da Task 2 e 3).

- [ ] **Step 4: Conferir no navegador**

```bash
cd src && npm run dev     # terminal 1
cd web && npm run dev     # terminal 2
```

Abra `/admin/dashboard` como admin. Confira:
1. O rótulo diz "Usuários online".
2. Abra a mesma conta em outra janela anônima — o número sobe (pode levar até 60s, ou recarregue o dashboard).
3. Na aba Network, um `POST /me/heartbeat` a cada 60s enquanto a aba estiver na frente; ao trocar de aba e esperar, ele para.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/Layout.jsx web/src/pages/admin/AdminDashboardPage.jsx
git commit -m "feat(web): heartbeat de presença e KPI de usuários online"
```

---

### Task 5: Ícones da marca e manifest

**Files:**
- Create: `web/public/favicon-32.png`, `web/public/apple-touch-icon.png`, `web/public/icon-512.png`, `web/public/favicon.ico`, `web/public/manifest.json`
- Create: `web/scripts/gerar-favicons.sh`
- Modify: `web/index.html`

**Interfaces:**
- Consumes: `web/src/assets/studio-vivian-simbolo.png` (1080×1080, já no repo).
- Produces: nada para tarefas seguintes.

- [ ] **Step 1: Escrever o script de geração**

Os PNG saem do `sips` (embutido no macOS). O `.ico` não: nem ImageMagick nem Pillow estão disponíveis nesta máquina. Mas o formato ICO aceita um PNG inteiro como payload desde o Windows Vista, e o cabeçalho tem 22 bytes — dá para montar sem dependência.

Create `web/scripts/gerar-favicons.sh`:

```bash
#!/usr/bin/env bash
# Gera os ícones da aba a partir do símbolo da marca. Rode de novo se o
# símbolo mudar; os arquivos gerados são COMMITADOS (Vite serve public/ como
# estático, não é build step).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FONTE="$ROOT_DIR/src/assets/studio-vivian-simbolo.png"
SAIDA="$ROOT_DIR/public"

mkdir -p "$SAIDA"

sips -z 32 32    "$FONTE" --out "$SAIDA/favicon-32.png"       >/dev/null
sips -z 180 180  "$FONTE" --out "$SAIDA/apple-touch-icon.png" >/dev/null
sips -z 512 512  "$FONTE" --out "$SAIDA/icon-512.png"         >/dev/null

# .ico a partir do PNG de 32: o formato aceita payload PNG desde o Vista, e o
# cabeçalho são 22 bytes. Evita depender de ImageMagick só para isto.
python3 - "$SAIDA/favicon-32.png" "$SAIDA/favicon.ico" <<'PY'
import struct, sys

origem, destino = sys.argv[1], sys.argv[2]
with open(origem, 'rb') as f:
    png = f.read()

# ICONDIR: reservado=0, tipo=1 (ícone), quantidade=1
cabecalho = struct.pack('<HHH', 0, 1, 1)
# ICONDIRENTRY: 32x32, sem paleta, 1 plano, 32 bits, tamanho, offset (6+16=22)
entrada = struct.pack('<BBBBHHII', 32, 32, 0, 0, 1, 32, len(png), 22)

with open(destino, 'wb') as f:
    f.write(cabecalho + entrada + png)
print(f'favicon.ico gerado ({len(png) + 22} bytes)')
PY

echo "✔ ícones em $SAIDA"
```

- [ ] **Step 2: Rodar e conferir a saída**

```bash
chmod +x web/scripts/gerar-favicons.sh
./web/scripts/gerar-favicons.sh
file web/public/*.png web/public/favicon.ico
```

Expected: os três PNG nas dimensões 32×32, 180×180 e 512×512, e o `favicon.ico` reconhecido como `MS Windows icon resource - 1 icon, 32x32`.

- [ ] **Step 3: Olhar o ícone de 32 com olho crítico**

```bash
open web/public/favicon-32.png
```

O que funciona num header de 1080px pode virar borrão em 32. Se o símbolo não sobreviver, **não troque a marca** — engorde o traço ou recorte mais fechado, regerando só o PNG de 32. Se estiver legível, siga.

- [ ] **Step 4: Criar o manifest**

Create `web/public/manifest.json` (cores vindas de `web/src/index.css`: `--color-bg: #ECECEC`, `--color-ink: #0F0F0F`):

```json
{
  "name": "Gestão VOID",
  "short_name": "VOID",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#ECECEC",
  "theme_color": "#0F0F0F",
  "icons": [
    { "src": "/favicon-32.png", "sizes": "32x32", "type": "image/png" },
    { "src": "/apple-touch-icon.png", "sizes": "180x180", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" }
  ]
}
```

- [ ] **Step 5: Ligar no `index.html`**

`web/index.html` inteiro passa a ser:

```html
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/manifest.json" />
    <meta name="theme-color" content="#0F0F0F" />
    <title>Gestão VOID</title>
  </head>
  <body class="bg-bg text-text-primary antialiased font-sans">
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Verificar que o build copia os arquivos**

```bash
cd web && npm run build && ls dist/favicon.ico dist/manifest.json dist/icon-512.png
```

Expected: os três existem em `dist/`. O Vite copia `public/` para a raiz do build automaticamente, e o `Caddyfile` (`try_files {path} /index.html` + `file_server`) os serve. Detalhe que explica o globo cinza de hoje: sem o arquivo, o `try_files` devolve o `index.html` com status 200 para `/favicon.ico` — o navegador recebe HTML onde esperava imagem e cai no ícone padrão.

- [ ] **Step 7: Conferir no navegador**

```bash
cd web && npm run dev
```

A aba deve mostrar o símbolo. Se ainda aparecer o globo, é cache de favicon do Chrome — abra numa janela anônima.

- [ ] **Step 8: Commit**

```bash
git add web/public web/index.html web/scripts/gerar-favicons.sh
git commit -m "feat(web): favicon, apple-touch-icon e manifest a partir do símbolo da marca"
```

---

### Task 6: Título da aba por página

**Files:**
- Create: `web/src/hooks/useDocumentTitle.js`
- Create: `web/src/hooks/useDocumentTitle.test.jsx`
- Modify: `web/src/components/ui/PageHeader.jsx`
- Modify: `web/src/pages/EmployeeDashboardPage.jsx`, `web/src/pages/LoginPage.jsx`, `web/src/pages/AssistentePage.jsx`, `web/src/pages/ProfilePage.jsx`

**Interfaces:**
- Consumes: nada.
- Produces: `useDocumentTitle(titulo?: string): void` — grava `"<titulo> · Gestão VOID"`, ou só `"Gestão VOID"` quando `titulo` for vazio.

- [ ] **Step 1: Write the failing test**

Create `web/src/hooks/useDocumentTitle.test.jsx`:

```jsx
/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { useDocumentTitle } from './useDocumentTitle'

describe('useDocumentTitle', () => {
  afterEach(cleanup)

  it('monta "Página · Gestão VOID"', () => {
    renderHook(() => useDocumentTitle('Projetos'))
    expect(document.title).toBe('Projetos · Gestão VOID')
  })

  it('sem título, fica só o nome do sistema', () => {
    renderHook(() => useDocumentTitle())
    expect(document.title).toBe('Gestão VOID')
  })

  it('string vazia também cai no nome do sistema', () => {
    renderHook(() => useDocumentTitle(''))
    expect(document.title).toBe('Gestão VOID')
  })

  it('reage à troca de título', () => {
    const { rerender } = renderHook(({ t }) => useDocumentTitle(t), {
      initialProps: { t: 'Projetos' },
    })
    expect(document.title).toBe('Projetos · Gestão VOID')
    rerender({ t: 'Pessoas' })
    expect(document.title).toBe('Pessoas · Gestão VOID')
  })

  // PageHeader aceita `title` como nó JSX em algumas telas; nesse caso não há
  // texto para pôr na aba e escrever "[object Object] · Gestão VOID" seria pior
  // que não fazer nada.
  it('ignora título que não seja string', () => {
    document.title = 'Gestão VOID'
    renderHook(() => useDocumentTitle(<span>Oi</span>))
    expect(document.title).toBe('Gestão VOID')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web && npx vitest run src/hooks/useDocumentTitle.test.jsx
```

Expected: FAIL — `Failed to resolve import "./useDocumentTitle"`.

- [ ] **Step 3: Implementar o hook**

Create `web/src/hooks/useDocumentTitle.js`:

```js
import { useEffect } from 'react'

const SUFIXO = 'Gestão VOID'

// Título da aba no formato "Página · Gestão VOID" (item 10 do PDF de ajustes).
// Sem título — ou com um título que não seja texto — fica só o nome do sistema:
// PageHeader aceita `title` como nó JSX em algumas telas, e "[object Object] ·
// Gestão VOID" seria pior que não mexer.
export function useDocumentTitle(titulo) {
  useEffect(() => {
    const texto = typeof titulo === 'string' ? titulo.trim() : ''
    document.title = texto ? `${texto} · ${SUFIXO}` : SUFIXO
  }, [titulo])
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd web && npx vitest run src/hooks/useDocumentTitle.test.jsx
```

Expected: PASS, 5 testes.

- [ ] **Step 5: Ligar no `PageHeader`**

Dezenove páginas já usam `PageHeader` e já passam o nome da tela em `title`. Ligar o hook ali cobre todas de uma vez, em vez de editar dezenove arquivos e esquecer o vigésimo.

`web/src/components/ui/PageHeader.jsx` passa a ser:

```jsx
import { useDocumentTitle } from '../../hooks/useDocumentTitle'

export function PageHeader({ title, subtitle, badge, actions, children }) {
  // O título da tela também é o título da aba. Ligar aqui cobre todas as
  // páginas que já usam este componente; quem não usa chama o hook direto.
  useDocumentTitle(title)

  return (
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-7">
      <div className="min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-display text-3xl font-light text-text-primary leading-tight">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="font-serif-em text-[15px] leading-snug text-text-secondary mt-1">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap md:pr-12">{actions}</div>}
    </div>
  )
}
```

- [ ] **Step 6: Cobrir as páginas sem `PageHeader`**

Quatro telas não usam o componente. Em cada uma, importe o hook e chame-o como primeira linha do corpo do componente:

```js
import { useDocumentTitle } from '../hooks/useDocumentTitle'
```

| Arquivo | Chamada |
|---|---|
| `web/src/pages/EmployeeDashboardPage.jsx` | `useDocumentTitle('Início')` |
| `web/src/pages/LoginPage.jsx` | `useDocumentTitle('Entrar')` |
| `web/src/pages/AssistentePage.jsx` | `useDocumentTitle('Assistente')` |
| `web/src/pages/ProfilePage.jsx` | `useDocumentTitle('Perfil')` |

Em `LoginPage.jsx` o caminho do import é `'../hooks/useDocumentTitle'` também — as quatro estão em `web/src/pages/`.

- [ ] **Step 7: Rodar a suíte do front**

```bash
cd web && npx vitest run
```

Expected: PASS, 18 arquivos / 142 testes.

- [ ] **Step 8: Conferir no navegador**

```bash
cd web && npm run dev
```

Navegue por `/projetos`, `/pessoas` e `/agenda`. A aba deve mostrar "Projetos · Gestão VOID", "Pessoas · Gestão VOID", "Agenda · Gestão VOID". Volte para `/dashboard`: "Início · Gestão VOID".

- [ ] **Step 9: Commit**

```bash
git add web/src/hooks/useDocumentTitle.js web/src/hooks/useDocumentTitle.test.jsx web/src/components/ui/PageHeader.jsx web/src/pages/EmployeeDashboardPage.jsx web/src/pages/LoginPage.jsx web/src/pages/AssistentePage.jsx web/src/pages/ProfilePage.jsx
git commit -m "feat(web): título da aba por página via PageHeader"
```

---

### Task 7: Verificação final e aceite

**Files:** nenhum (só verificação).

- [ ] **Step 1: Suíte da API**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run
```

Expected: PASS. 133 arquivos, 857 testes.

- [ ] **Step 2: Suíte do front**

```bash
cd web && npx vitest run
```

Expected: PASS. 18 arquivos, 142 testes.

- [ ] **Step 3: Build do front**

```bash
cd web && npm run build
```

Expected: build sem erro; `dist/favicon.ico` e `dist/manifest.json` presentes.

- [ ] **Step 4: Roteiro de aceite do PDF**

Item 9 — *"O rótulo mostra 'usuários online' e o número muda quando alguém entra ou sai do sistema."*
1. Abra `/admin/dashboard` como admin e anote o número.
2. Entre com outra conta em janela anônima.
3. Recarregue o dashboard: o número subiu.
4. Feche a janela anônima, espere 5 minutos, recarregue: o número voltou.

Item 10 — *"A aba do navegador mostra o símbolo da marca e o título da página aberta."*
1. A aba mostra o símbolo (janela anônima, para escapar do cache de favicon).
2. Navegando entre telas, o título acompanha.
3. No celular, "Adicionar à tela de início" usa o nome "VOID" e o ícone certo.

- [ ] **Step 5: Marcar os itens no spec**

Em `docs/superpowers/specs/2026-08-18-ajustes-void-a-interface-design.md`, troque o `**Status:**` do cabeçalho por:

```markdown
**Status:** itens 9 e 10 implementados (plano A1); item 11 pendente (plano A2)
```

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-08-18-ajustes-void-a-interface-design.md
git commit -m "docs: marca os itens 9 e 10 do bloco A como implementados"
```
