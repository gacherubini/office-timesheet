# Observabilidade da API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instrumentar a API Express com log estruturado por request (incluindo duração, que
permite calcular p50/p95/p99), tratamento central de erros e envio para o Axiom.

**Architecture:** Um logger pino único em `src/lib/logger.js` decide destino por ambiente
(memória em teste, pretty em dev, stdout + Axiom em produção). Um middleware próprio em
`src/middleware/requestLogger.js` cronometra cada request e emite uma linha JSON plana ao
terminar. Um par `notFound` + `errorHandler` em `src/middleware/errorHandler.js` fecha a cadeia.
As rotas existentes não mudam de comportamento.

**Tech Stack:** Node 20, Express 5, pino 9, pino-pretty (dev), `@axiomhq/pino` (produção),
Vitest + Supertest.

**Spec:** `docs/superpowers/specs/2026-07-26-observabilidade-logs-design.md`

## Desvio consciente da spec

A spec previa `pino-http` para o middleware de request. O plano **não usa `pino-http`** e
implementa ~35 linhas próprias. Motivo: a spec exige um JSON **plano**
(`{method, route, status, duracao_ms, ...}`), enquanto o `pino-http` aninha tudo sob `req`/`res`
via serializers — achatá-lo exige desligar os serializers padrão e reconstruir os campos em
`customProps`, o que dá mais código e mais superfície de surpresa do que escrever o middleware.
Além disso, a captura de `erro_msg` (embrulho de `res.json`) precisa ser própria de qualquer jeito.
O resultado é mais curto, mais legível e testável sem depender do formato interno de terceiros.

Nenhum outro ponto da spec muda. Uma refinação: a spec dizia logger `silent` em teste; aqui ele
escreve num **sink em memória**, que não polui a saída (mesmo efeito prático) e ainda permite
que os testes verifiquem o que foi logado.

## Global Constraints

- ESM em todo o projeto (`"type": "module"` em `src/package.json`). Use `import`, nunca `require`.
- Node 20 (`node:20-alpine` no `src/Dockerfile`).
- Idioma dos comentários e mensagens de log: **português**, seguindo o código existente.
- Nome de campo de duração: exatamente **`duracao_ms`** (numérico, milissegundos).
- Censura literal: a string exata **`[Redacted]`**.
- Testes rodam serial (`fileParallelism: false`, `maxWorkers: 1` em `src/vitest.config.js`).
  `NODE_ENV=test` já é injetado pelo vitest.
- Todos os comandos rodam a partir de `src/`.
- Nenhuma resposta HTTP existente pode mudar de status ou de corpo — exceto rotas inexistentes
  (passam a devolver JSON 404) e erros não tratados (passam a devolver JSON 500).

---

### Task 1: Logger base (`src/lib/logger.js`)

Cria o logger único com níveis, censura e destino por ambiente. Sem Axiom ainda (Task 5).

**Files:**
- Create: `src/lib/logger.js`
- Create: `src/tests/unit/logger.test.js`
- Modify: `src/package.json` (dependências)

Todos os comandos deste plano rodam a partir de `src/`, então os caminhos nos comandos são
relativos a ela (`tests/unit/logger.test.js`).

**Interfaces:**
- Consumes: nada.
- Produces:
  - `logger` — instância pino. Métodos usados no projeto: `logger.info(obj)`,
    `logger.warn(obj)`, `logger.error(obj)`, `logger.debug(obj)`.
  - `testSink: Array<object>` — em `NODE_ENV=test`, cada linha logada vira um objeto neste array.
  - `clearTestSink(): void` — esvazia o array.
  - `REDACT_PATHS: string[]` — caminhos censurados.

- [ ] **Step 1: Instalar dependências**

```bash
npm install pino
npm install --save-dev pino-pretty
```

- [ ] **Step 2: Escrever o teste que falha**

Crie `tests/unit/logger.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { logger, testSink, clearTestSink } from '../../lib/logger.js'

describe('logger — censura de dados sensíveis', () => {
  beforeEach(() => clearTestSink())

  it('censura o header authorization', () => {
    logger.info({ headers: { authorization: 'Bearer abc.def.ghi' } })
    expect(testSink[0].headers.authorization).toBe('[Redacted]')
  })

  it('censura o header cookie', () => {
    logger.info({ headers: { cookie: 'session=segredo' } })
    expect(testSink[0].headers.cookie).toBe('[Redacted]')
  })

  it('censura password e senha em qualquer corpo', () => {
    logger.info({ body: { password: 'p4ssw0rd', senha: 'segredo', email: 'a@b.com' } })
    expect(testSink[0].body.password).toBe('[Redacted]')
    expect(testSink[0].body.senha).toBe('[Redacted]')
    expect(testSink[0].body.email).toBe('a@b.com')
  })

  it('censura token e newPassword', () => {
    logger.info({ body: { token: 'tok', newPassword: 'nova' } })
    expect(testSink[0].body.token).toBe('[Redacted]')
    expect(testSink[0].body.newPassword).toBe('[Redacted]')
  })

  it('em teste escreve no sink e não no stdout', () => {
    logger.info({ msg: 'oi' })
    expect(testSink).toHaveLength(1)
    expect(testSink[0].msg).toBe('oi')
  })

  it('clearTestSink esvazia o sink', () => {
    logger.info({ msg: 'a' })
    clearTestSink()
    expect(testSink).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

```bash
npx vitest run tests/unit/logger.test.js
```

Esperado: FAIL — `Failed to resolve import "../../lib/logger.js"`.

- [ ] **Step 4: Implementar `src/lib/logger.js`**

```js
import pino from 'pino'

// Logger único da API. O destino muda por ambiente:
//   test  → array em memória (não polui a saída e os testes conseguem inspecionar)
//   dev   → pino-pretty, colorido e legível no terminal
//   prod  → stdout em JSON (o Axiom entra na Task 5)
const env = process.env.NODE_ENV
const isTest = env === 'test'
const isProd = env === 'production'

// Caminhos censurados antes de qualquer serialização. Sem isso o JWT de um
// admin sairia em texto puro para um serviço de terceiros.
export const REDACT_PATHS = [
  'headers.authorization',
  'headers.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  'senha',
  'token',
  'newPassword',
  '*.password',
  '*.senha',
  '*.token',
  '*.newPassword',
]

const redact = { paths: REDACT_PATHS, censor: '[Redacted]' }

// Sink de teste: cada linha logada vira um objeto aqui.
export const testSink = []
export function clearTestSink() {
  testSink.length = 0
}

const level = process.env.LOG_LEVEL || (isProd ? 'info' : 'debug')

function build() {
  if (isTest) {
    const stream = {
      write: (line) => {
        testSink.push(JSON.parse(line))
      },
    }
    return pino({ level: 'debug', redact, base: undefined }, stream)
  }

  if (!isProd) {
    return pino({
      level,
      redact,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
    })
  }

  return pino({ level, redact })
}

export const logger = build()
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

```bash
npx vitest run tests/unit/logger.test.js
```

Esperado: PASS, 6 testes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/logger.js src/tests/unit/logger.test.js src/package.json src/package-lock.json
git commit -m "feat(logs): logger pino com censura e destino por ambiente"
```

---

### Task 2: Middleware de request (`src/middleware/requestLogger.js`)

O coração do plano: cronometra cada request e emite a linha plana com `duracao_ms`.

**Files:**
- Create: `src/middleware/requestLogger.js`
- Create: `tests/unit/requestLogger.test.js`
- Modify: `src/app.js`
- Create: `tests/integration/logging.test.js`

**Interfaces:**
- Consumes: `logger`, `testSink`, `clearTestSink` da Task 1.
- Produces:
  - `routeOf(req): string` — padrão da rota (`/projects/:id/tasks`) ou `'unmatched'`.
  - `levelFor(status: number): 'info' | 'warn' | 'error'`.
  - `makeRequestLogger(logger): (req, res, next) => void` — fábrica, usada nos testes.
  - `requestLogger` — instância já ligada ao `logger` padrão, usada em `app.js`.
  - Efeito colateral: define `req.req_id` (string UUID) e o header de resposta `x-request-id`.

- [ ] **Step 1: Escrever o teste unitário que falha**

Crie `tests/unit/requestLogger.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { routeOf, levelFor } from '../../middleware/requestLogger.js'

describe('routeOf — padrão da rota, nunca a URL concreta', () => {
  it('rota simples na raiz', () => {
    expect(routeOf({ baseUrl: '', route: { path: '/projects' } })).toBe('/projects')
  })

  it('rota com parâmetro mantém o :id', () => {
    expect(routeOf({ baseUrl: '', route: { path: '/projects/:id/tasks' } }))
      .toBe('/projects/:id/tasks')
  })

  it('router montado com prefixo concatena o baseUrl', () => {
    expect(routeOf({ baseUrl: '/admin', route: { path: '/users/:id' } }))
      .toBe('/admin/users/:id')
  })

  it('request sem rota casada vira "unmatched"', () => {
    expect(routeOf({ baseUrl: '', route: undefined })).toBe('unmatched')
  })
})

describe('levelFor — nível derivado do status', () => {
  it('200 → info', () => expect(levelFor(200)).toBe('info'))
  it('201 → info', () => expect(levelFor(201)).toBe('info'))
  it('304 → info', () => expect(levelFor(304)).toBe('info'))
  it('400 → warn', () => expect(levelFor(400)).toBe('warn'))
  it('404 → warn', () => expect(levelFor(404)).toBe('warn'))
  it('499 → warn', () => expect(levelFor(499)).toBe('warn'))
  it('500 → error', () => expect(levelFor(500)).toBe('error'))
  it('503 → error', () => expect(levelFor(503)).toBe('error'))
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run tests/unit/requestLogger.test.js
```

Esperado: FAIL — `Failed to resolve import "../../middleware/requestLogger.js"`.

- [ ] **Step 3: Implementar `src/middleware/requestLogger.js`**

```js
import { randomUUID } from 'node:crypto'
import { logger as defaultLogger } from '../lib/logger.js'

// Padrão da rota (/projects/:id), não a URL concreta (/projects/318). Guardar a
// URL crua faria cada projeto virar uma série distinta e impediria agregar por
// rota — que é justamente o que permite achar a rota lenta.
export function routeOf(req) {
  if (!req.route?.path) return 'unmatched'
  return `${req.baseUrl || ''}${req.route.path}`
}

export function levelFor(status) {
  if (status >= 500) return 'error'
  if (status >= 400) return 'warn'
  return 'info'
}

// O Fly bate no /health o tempo todo. Em nível debug ele não sobe pro log
// center em produção (LOG_LEVEL=info), mas continua visível em dev.
function levelForRequest(req, status) {
  if (req.originalUrl === '/health') return 'debug'
  return levelFor(status)
}

export function makeRequestLogger(logger) {
  return function requestLogger(req, res, next) {
    const start = process.hrtime.bigint()

    req.req_id = randomUUID()
    res.setHeader('x-request-id', req.req_id)

    let logged = false
    const emit = () => {
      if (logged) return
      logged = true

      const duracao_ms = Number(process.hrtime.bigint() - start) / 1e6
      const status = res.statusCode

      logger[levelForRequest(req, status)]({
        req_id: req.req_id,
        method: req.method,
        route: routeOf(req),
        status,
        duracao_ms: Math.round(duracao_ms * 100) / 100,
        user_id: req.profile?.id,
        ip: req.ip,
      })
    }

    // 'finish' = resposta enviada com sucesso. 'close' cobre conexão abortada
    // pelo cliente antes do fim (senão o request sumiria do log).
    res.on('finish', emit)
    res.on('close', emit)

    next()
  }
}

export const requestLogger = makeRequestLogger(defaultLogger)
```

- [ ] **Step 4: Rodar o teste unitário e confirmar que passa**

```bash
npx vitest run tests/unit/requestLogger.test.js
```

Esperado: PASS, 12 testes.

- [ ] **Step 5: Plugar em `src/app.js`**

Em `src/app.js`, adicione o import junto aos outros imports de topo (depois da linha
`import { localUploadsDir } from './lib/storage.js'`):

```js
import { requestLogger } from './middleware/requestLogger.js'
```

Logo depois de `const app = express()` (linha 30), adicione:

```js
// No Fly a API fica atrás do proxy da plataforma. Sem isso req.ip registra o IP
// interno do proxy — igual para todo mundo, portanto inútil.
app.set('trust proxy', true)

// Antes de tudo: cronometra e identifica o request desde o primeiro byte.
app.use(requestLogger)
```

A ordem final do topo do arquivo fica: `trust proxy` → `requestLogger` → `cors` →
`express.json` → `/uploads` → `/health` → rotas.

- [ ] **Step 6: Escrever o teste de integração que falha**

Crie `tests/integration/logging.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../helpers/db.js'
import { asUser, request } from '../helpers/api.js'
import { makeUser } from '../helpers/factories.js'
import { testSink, clearTestSink } from '../../lib/logger.js'

// Pega a última linha que tem duracao_ms (a linha de request).
const lastRequestLog = () => [...testSink].reverse().find((l) => l.duracao_ms !== undefined)

describe('log de request', () => {
  let user

  beforeEach(async () => {
    await resetDb()
    user = await makeUser()
    clearTestSink()
  })

  it('request autenticado gera linha com todos os campos', async () => {
    await asUser(user).get('/me/stats')
    const log = lastRequestLog()

    expect(log).toBeDefined()
    expect(log.method).toBe('GET')
    expect(log.status).toBe(200)
    expect(typeof log.duracao_ms).toBe('number')
    expect(log.duracao_ms).toBeGreaterThanOrEqual(0)
    expect(log.user_id).toBe(user.id)
    expect(typeof log.req_id).toBe('string')
    expect(log.level).toBe(30) // info
  })

  it('route guarda o padrão da rota, não a URL concreta', async () => {
    await asUser(user).get(`/projects/999999/my-hours`)
    const log = lastRequestLog()

    expect(log.route).toContain(':id')
    expect(log.route).not.toContain('999999')
  })

  it('request sem token gera linha em nível warn e sem user_id', async () => {
    await request.get('/me/stats')
    const log = lastRequestLog()

    expect(log.status).toBe(401)
    expect(log.level).toBe(40) // warn
    expect(log.user_id).toBeUndefined()
  })

  it('/health não gera linha em nível info', async () => {
    await request.get('/health')
    const log = lastRequestLog()

    expect(log.level).toBe(20) // debug
  })

  it('nenhum log contém o token em texto puro', async () => {
    await asUser(user).get('/me/stats')
    const bruto = JSON.stringify(testSink)

    expect(bruto).not.toContain('Bearer ')
    expect(bruto).not.toMatch(/eyJ[A-Za-z0-9_-]+\./) // formato de JWT
  })

  it('a resposta traz o header x-request-id', async () => {
    const res = await asUser(user).get('/me/stats')
    expect(res.headers['x-request-id']).toBeTruthy()
  })
})
```

- [ ] **Step 7: Rodar o teste de integração**

Suba o banco de teste, se ainda não estiver de pé:

```bash
docker compose -f ../docker-compose.test.yml up -d
```

```bash
npx vitest run tests/integration/logging.test.js
```

Esperado: PASS, 6 testes.

As rotas usadas nos testes existem e estão verificadas: `GET /me/stats` (`src/routes/me.js:314`,
protegida por `requireAuth`) e `GET /projects/:id/my-hours` (`src/routes/projects.js:349`).

- [ ] **Step 8: Rodar a suíte inteira (regressão)**

```bash
npm test
```

Esperado: todas as suítes verdes. Nenhuma resposta mudou; só passou a existir log.

- [ ] **Step 9: Commit**

```bash
git add src/middleware/requestLogger.js src/app.js src/tests
git commit -m "feat(logs): middleware de request com duracao_ms, req_id e rota"
```

---

### Task 3: Captura da mensagem de erro em 4xx

As rotas devolvem `400 { error: msg }` sem logar nada. Esta task torna a mensagem visível no log
sem tocar nas ~130 rotas.

**Files:**
- Modify: `src/middleware/requestLogger.js`
- Modify: `tests/integration/logging.test.js`

**Interfaces:**
- Consumes: `makeRequestLogger` da Task 2.
- Produces: campo `erro_msg` (string, ≤200 chars) na linha de log quando `status >= 400`.

- [ ] **Step 1: Escrever o teste que falha**

Adicione ao final de `tests/integration/logging.test.js`, dentro do `describe` existente:

```js
  it('4xx registra a mensagem devolvida em erro_msg', async () => {
    await request.get('/me/stats') // 401 { error: 'Token ausente.' }
    const log = lastRequestLog()

    expect(log.erro_msg).toBe('Token ausente.')
  })

  it('2xx não tem erro_msg', async () => {
    await asUser(user).get('/me/stats')
    const log = lastRequestLog()

    expect(log.erro_msg).toBeUndefined()
  })
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run tests/integration/logging.test.js
```

Esperado: FAIL — `expected undefined to be 'Token ausente.'`.

- [ ] **Step 3: Embrulhar `res.json` em `src/middleware/requestLogger.js`**

Dentro de `makeRequestLogger`, logo depois de `res.setHeader('x-request-id', req.req_id)`,
adicione:

```js
    // A mensagem de erro só existe no corpo da resposta. Guardamos apenas o
    // campo `error` (nunca o corpo inteiro, pra não vazar dado de negócio) e
    // devolvemos exatamente o que res.json devolveria — nenhuma resposta muda.
    const jsonOriginal = res.json.bind(res)
    res.json = (body) => {
      if (res.statusCode >= 400 && typeof body?.error === 'string') {
        req._erroMsg = body.error.slice(0, 200)
      }
      return jsonOriginal(body)
    }
```

E dentro de `emit()`, adicione o campo ao objeto logado, depois de `ip`:

```js
        erro_msg: req._erroMsg,
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run tests/integration/logging.test.js
```

Esperado: PASS, 8 testes.

- [ ] **Step 5: Rodar a suíte inteira**

```bash
npm test
```

Esperado: verde. Este é o passo mais importante desta task — o embrulho de `res.json` toca o
caminho de resposta de toda a API, então a regressão precisa estar limpa.

- [ ] **Step 6: Commit**

```bash
git add src/middleware/requestLogger.js src/tests/integration/logging.test.js
git commit -m "feat(logs): registra a mensagem devolvida em respostas 4xx"
```

---

### Task 4: 404, error handler central e crashes do processo

**Files:**
- Create: `src/middleware/errorHandler.js`
- Modify: `src/app.js`
- Modify: `src/server.js`
- Modify: `tests/integration/logging.test.js`

**Interfaces:**
- Consumes: `logger` (Task 1), `req.req_id` (Task 2).
- Produces:
  - `notFound(req, res)` — responde `404 { error: 'Rota não encontrada.' }`.
  - `makeErrorHandler(logger): (err, req, res, next) => void`.
  - `errorHandler` — instância ligada ao logger padrão.
  - `installProcessHandlers(logger): void` — registra `uncaughtException` e `unhandledRejection`.

- [ ] **Step 1: Escrever o teste que falha**

Adicione ao final de `tests/integration/logging.test.js`, **fora** do `describe` existente:

```js
describe('404 e erro não tratado', () => {
  beforeEach(() => clearTestSink())

  it('rota inexistente devolve 404 em JSON', async () => {
    const res = await request.get('/rota-que-nao-existe')

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Rota não encontrada.')
  })

  it('rota inexistente é logada como unmatched', async () => {
    await request.get('/rota-que-nao-existe')
    const log = lastRequestLog()

    expect(log.route).toBe('unmatched')
    expect(log.status).toBe(404)
  })

  it('JSON malformado devolve 500 com req_id no corpo', async () => {
    const res = await request
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ isso não é json')

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Erro interno.')
    expect(typeof res.body.req_id).toBe('string')
  })

  it('erro não tratado gera log de nível error com stack', async () => {
    await request
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ isso não é json')

    const erro = testSink.find((l) => l.level === 50)
    expect(erro).toBeDefined()
    expect(erro.err.stack).toBeTruthy()
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run tests/integration/logging.test.js
```

Esperado: FAIL — a rota inexistente devolve HTML do Express, não JSON.

- [ ] **Step 3: Implementar `src/middleware/errorHandler.js`**

```js
import { logger as defaultLogger } from '../lib/logger.js'

export function notFound(req, res) {
  return res.status(404).json({ error: 'Rota não encontrada.' })
}

// Último middleware da cadeia. Captura o que escapa das rotas: throw fora de
// try, erro do Multer, JSON malformado do express.json(). O req_id vai no corpo
// pro usuário poder reportar o código e você achar o log exato.
export function makeErrorHandler(logger) {
  return function errorHandler(err, req, res, _next) {
    logger.error({
      req_id: req.req_id,
      method: req.method,
      url: req.originalUrl,
      status_original: err.status || err.statusCode,
      user_id: req.profile?.id,
      err: { type: err.name, message: err.message, stack: err.stack },
    })

    if (res.headersSent) return

    // Sempre 500: chegar aqui significa que ninguém tratou o erro. As rotas que
    // sabem responder outro status já respondem sozinhas (os ~130 catch). O
    // status original do erro fica registrado no log como `status_original`.
    return res.status(500).json({
      error: 'Erro interno.',
      req_id: req.req_id,
    })
  }
}

export const errorHandler = makeErrorHandler(defaultLogger)

// Um erro fora do ciclo de request hoje derruba a API em silêncio. Aqui ele ao
// menos deixa rastro antes de morrer.
export function installProcessHandlers(logger) {
  process.on('uncaughtException', (err) => {
    logger.error({ err: { type: err.name, message: err.message, stack: err.stack } },
      'uncaughtException — encerrando')
    process.exit(1)
  })

  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason))
    logger.error({ err: { type: err.name, message: err.message, stack: err.stack } },
      'unhandledRejection')
  })
}
```

Nota sobre o JSON malformado: o `express.json()` gera um erro com `status: 400`, mas o handler
responde 500 mesmo assim, por decisão. Motivo: chegar ao handler significa que nenhuma rota
tratou o erro — e responder o `err.status` cru abriria a porta pra bibliotecas de terceiros
ditarem o status da sua API. O 400 original fica registrado no log em `status_original`.

- [ ] **Step 4: Plugar em `src/app.js`**

Adicione o import junto aos outros:

```js
import { notFound, errorHandler } from './middleware/errorHandler.js'
```

E no **final** do arquivo, depois de todas as chamadas `app.use(...)` de rotas e **antes** de
`export { app }`:

```js
// Depois de todas as rotas: 404 pra caminho inexistente, e o handler central
// como último elo da cadeia.
app.use(notFound)
app.use(errorHandler)
```

- [ ] **Step 5: Ligar os handlers de processo em `src/server.js`**

Substitua o conteúdo de `src/server.js` por:

```js
import 'dotenv/config'

import { pool } from './lib/db.js'
import { app } from './app.js'
import { logger } from './lib/logger.js'
import { installProcessHandlers } from './middleware/errorHandler.js'

const port = process.env.PORT || 3333

installProcessHandlers(logger)

async function start() {
  // Garante que o DB tá acessível antes de aceitar requests
  await pool.query('SELECT 1')
  app.listen(port, () => {
    logger.info({ port }, `API rodando em http://localhost:${port}`)
  })
}

start().catch((err) => {
  logger.error({ err: { message: err.message, stack: err.stack } }, 'Falha ao iniciar API')
  process.exit(1)
})
```

- [ ] **Step 6: Rodar e confirmar que passa**

```bash
npx vitest run tests/integration/logging.test.js
```

Esperado: PASS, 12 testes.

- [ ] **Step 7: Rodar a suíte inteira**

```bash
npm test
```

Esperado: verde. Atenção: se alguma suíte esperava o 404 em HTML do Express, ela vai falhar aqui
— corrija a expectativa dela, não o handler.

- [ ] **Step 8: Commit**

```bash
git add src/middleware/errorHandler.js src/app.js src/server.js src/tests/integration/logging.test.js
git commit -m "feat(logs): 404 em JSON, error handler central e captura de crash do processo"
```

---

### Task 5: Envio para o Axiom

**Files:**
- Modify: `src/lib/logger.js`
- Modify: `src/.env.example`
- Modify: `README.md`

**Interfaces:**
- Consumes: `logger` da Task 1.
- Produces: nenhuma API nova. Comportamento: com `AXIOM_TOKEN` e `AXIOM_DATASET` definidos em
  produção, os logs vão para stdout **e** para o Axiom; sem eles, só stdout.

- [ ] **Step 1: Instalar a dependência**

```bash
npm install @axiomhq/pino
```

- [ ] **Step 2: Trocar o ramo de produção em `src/lib/logger.js`**

Substitua a última linha da função `build()` (`return pino({ level, redact })`) por:

```js
  // Produção: sempre stdout (visível no `fly logs`) e, se configurado, também o
  // Axiom. O envio é best-effort: token errado ou serviço fora do ar não pode
  // derrubar request nem travar a API — os logs seguem saindo no stdout.
  const targets = [{ target: 'pino/file', options: { destination: 1 }, level }]

  const token = process.env.AXIOM_TOKEN
  const dataset = process.env.AXIOM_DATASET
  if (token && dataset) {
    targets.push({ target: '@axiomhq/pino', options: { token, dataset }, level })
  }

  return pino({ level, redact }, pino.transport({ targets }))
```

- [ ] **Step 3: Verificar que a API sobe sem o Axiom configurado**

```bash
NODE_ENV=production LOG_LEVEL=info node -e "import('./lib/logger.js').then(({logger}) => logger.info({teste: true}, 'sem axiom'))"
```

Esperado: uma linha JSON no stdout, sem erro. Este é o critério de aceite 6 da spec.

- [ ] **Step 4: Rodar a suíte inteira**

```bash
npm test
```

Esperado: verde (o ramo de teste não foi tocado).

- [ ] **Step 5: Documentar as variáveis em `src/.env.example`**

Adicione ao final do arquivo:

```bash
# Observabilidade
# LOG_LEVEL: debug | info | warn | error. Default: info em prod, debug fora.
LOG_LEVEL=

# Axiom (log center). Vazio = logs só no stdout / `fly logs`.
# Crie um dataset e um API token em https://app.axiom.co
AXIOM_TOKEN=
AXIOM_DATASET=
```

- [ ] **Step 6: Documentar no `README.md`**

Adicione uma seção `## Observabilidade` ao `README.md`, depois da seção de configuração local:

````markdown
## Observabilidade

Cada request da API gera uma linha JSON com método, rota, status, duração e usuário. Em
desenvolvimento sai formatada e colorida no terminal; em produção vai pro stdout (`fly logs`) e,
se configurado, pro [Axiom](https://app.axiom.co).

### Ligar o Axiom

```bash
fly secrets set AXIOM_TOKEN=xaat-... AXIOM_DATASET=office-timesheet -a office-timesheet-api
```

Sem essas variáveis a API funciona normalmente, logando só no stdout.

### Queries (APL)

```sql
-- p50/p95/p99 ao longo do tempo
['office-timesheet']
| summarize p50=percentile(duracao_ms,50),
            p95=percentile(duracao_ms,95),
            p99=percentile(duracao_ms,99)
  by bin_auto(_time)

-- rotas mais lentas
['office-timesheet']
| summarize p99=percentile(duracao_ms,99), qtd=count() by route
| order by p99 desc

-- taxa de erro
['office-timesheet']
| summarize erros=countif(status >= 500), total=count() by bin_auto(_time)

-- investigar um usuário
['office-timesheet']
| where user_id == 42
| order by _time desc

-- seguir um request específico
['office-timesheet']
| where req_id == "cole-o-req-id-aqui"
```

O `req_id` aparece no header `x-request-id` de toda resposta e no corpo das respostas 500.
````

- [ ] **Step 7: Commit**

```bash
git add src/lib/logger.js src/.env.example src/package.json src/package-lock.json README.md
git commit -m "feat(logs): envio para o Axiom + documentação das queries de p99"
```

---

### Task 6: Migrar os `console.*` para o logger

Troca mecânica das 48 chamadas em `lib/`, `middleware/` e `routes/`. Sem isso, esses erros
continuam em texto solto e não aparecem estruturados no Axiom.

`scripts/migrate.js` fica **fora**: roda no `CMD` do Docker antes do servidor subir, é saída de
deploy destinada a leitura humana no `fly logs`, e não faz parte do ciclo de request.

**Files:**
- Modify: `src/lib/db.js:28`, `src/lib/email.js:10,25`, `src/lib/notificationsHub.js:79`,
  `src/lib/storage.js:57,66`, `src/lib/taskActivity.js:13`, `src/middleware/auth.js:37`
- Modify: `src/routes/auth.js`, `clients.js`, `me.js`, `projects.js`, `projectTemplates.js`,
  `suppliers.js`, `users.js`

**Interfaces:**
- Consumes: `logger` da Task 1.
- Produces: nada novo.

- [ ] **Step 1: Confirmar o inventário**

```bash
grep -rn "console\." lib/ middleware/ routes/
```

Esperado: 48 ocorrências. Se o número mudou, o código andou — refaça o inventário antes de seguir.

- [ ] **Step 2: Converter, arquivo por arquivo**

Em cada arquivo, adicione o import no topo:

```js
import { logger } from '../lib/logger.js'
```

(em `src/lib/*.js` o caminho é `'./logger.js'`)

E aplique a conversão. O padrão: a string vira mensagem, o erro vira campo estruturado.

```js
// antes
console.error('Erro em GET /projects:', err)
// depois
logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro em GET /projects')

// antes
console.error(`Falha ao deletar ${key}:`, err.message)
// depois
logger.error({ key, err: { message: err.message } }, 'Falha ao deletar arquivo')

// antes  (lib/email.js:10 — não é erro)
console.log(`[DEV] Reset link para ${to}: ${resetUrl}`)
// depois
logger.debug({ to, resetUrl }, '[DEV] link de reset gerado')
```

Atenção em `lib/email.js:10`: o link de reset é credencial temporária. Fica em `debug`, portanto
não sobe pro Axiom em produção (`LOG_LEVEL=info`).

- [ ] **Step 3: Verificar que não sobrou nenhum**

```bash
grep -rn "console\." lib/ middleware/ routes/
```

Esperado: nenhuma saída.

- [ ] **Step 4: Verificar sintaxe de todos os arquivos**

```bash
npm run check
```

Esperado: sem erros.

- [ ] **Step 5: Rodar a suíte inteira**

```bash
npm test
```

Esperado: verde.

- [ ] **Step 6: Commit**

```bash
git add src/lib src/middleware src/routes
git commit -m "refactor(logs): console.* → logger estruturado em lib, middleware e routes"
```

---

### Task 7: Validação ponta a ponta

Fecha os critérios de aceite que só dá pra verificar com a API de pé.

**Files:** nenhum (validação).

- [ ] **Step 1: Subir a API local e observar o log bonito**

```bash
docker compose -f ../docker-compose.test.yml up -d
npm run dev
```

Em outro terminal:

```bash
curl -i localhost:3333/health
curl -i localhost:3333/rota-que-nao-existe
curl -i -X POST localhost:3333/auth/login -H 'Content-Type: application/json' -d '{"email":"x@y.com","password":"errado"}'
```

Verifique no terminal do `npm run dev`:
- cada request gerou uma linha com `duracao_ms` e `route`
- a rota inexistente registrou `route: unmatched` e devolveu JSON
- o login com senha errada saiu em nível `warn` com `erro_msg`
- nenhuma linha contém a senha `errado`
- toda resposta trouxe o header `x-request-id`

- [ ] **Step 2: Conferir os 8 critérios de aceite da spec**

Abra `docs/superpowers/specs/2026-07-26-observabilidade-logs-design.md`, seção "Critérios de
aceite", e marque um a um. Os itens 1–7 são verificáveis agora; o 8 depende do deploy.

- [ ] **Step 3: Deploy sem Axiom**

```bash
fly deploy -a office-timesheet-api
fly logs -a office-timesheet-api
```

Esperado: linhas JSON com `duracao_ms`. Ponto de validação da spec — valor entregue antes de
qualquer cadastro externo.

- [ ] **Step 4: Criar a conta e o dataset no Axiom**

1. Criar conta em https://app.axiom.co
2. Criar um dataset chamado `office-timesheet`
3. Criar um API token com permissão de ingest nesse dataset
4. Confirmar o free tier vigente na página de pricing (a spec assume ~30 dias de retenção)

```bash
fly secrets set AXIOM_TOKEN=xaat-... AXIOM_DATASET=office-timesheet -a office-timesheet-api
```

O `fly secrets set` reinicia a máquina sozinho.

- [ ] **Step 5: Confirmar a chegada dos eventos e rodar as queries**

Gere tráfego usando o sistema no navegador por um minuto, depois no Axiom rode cada query da
seção "Queries (APL)" do `README.md`. Confirme que a de p99 retorna número — é o critério de
aceite 8.

- [ ] **Step 6: Montar o dashboard**

No Axiom, criar um dashboard `Office Timesheet` com três painéis, usando as queries do README:
p50/p95/p99 ao longo do tempo, rotas mais lentas, taxa de erro.

- [ ] **Step 7: Commit final**

```bash
git commit --allow-empty -m "chore(logs): validação ponta a ponta concluída"
```

---

## Ordem e dependências

```
Task 1 (logger)
   └─ Task 2 (request logger) ── Task 3 (erro_msg)
         └─ Task 4 (404 + error handler)
               └─ Task 5 (Axiom)
                     └─ Task 6 (console.* → logger)
                           └─ Task 7 (validação)
```

Tasks 1–4 entregam observabilidade completa em stdout, sem depender de nenhum serviço externo.
Se algo travar na Task 5, o trabalho anterior continua útil.
