# Agente de Gestão — Fase 1, Milestone 6 (paridade executável + tools que faltam) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o escopo da Fase 1 em duas frentes: (1) tornar **executável** o teste de paridade do §18 — hoje ele existe só para `listar_equipe`, e são as outras onze tools que sustentam a decisão de não usar RLS (§3.1); (2) escrever as **quatro tools que o §8.1/§8.3 lista e que não existem**: `despesas_do_periodo`, `apontamentos_abertos`, o recorte por período do `status_projeto` (que absorve o `horas_por_projeto`) e `propor_pedir_ferias`.

**Architecture:** Nada de núcleo muda. As tools novas seguem o mesmo contrato dos M2–M5: um objeto `{ kind, espelha, roles, definition, run }` (leitura) ou `{ kind:'write', espelha, roles, definition, propose, execute }` (escrita), registrado em `tools/registry.js`, que filtra por papel antes de montar o prompt. A paridade vira **dois testes genéricos e dirigidos por tabela** em vez de um teste por tool: um de **papel** (os papéis que a tool aceita têm de ser exatamente os que o endpoint espelhado aceita) e um de **coluna por valor-sentinela** (nenhum papel sem acesso a dinheiro pode ver, em tool nenhuma, um valor financeiro plantado no fixture). Duas extrações de lógica compartilhada acompanham as tools de escrita, no precedente já aberto por `lib/performanceSimulation.js`: validação de férias sai de `routes/vacations.js` para `lib/vacationRequests.js`.

**Tech Stack:** Node/Express 5 (ESM), Postgres (`pg`), Vitest + Supertest. Sem dependência nova.

**Origem:** design em `docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md` — §2 (escopo da Fase 1), §8.1 (leitura curada), §8.3 (escrita), §18 (testes, incluindo o de paridade). Antecessores: `docs/superpowers/plans/2026-08-09-agente-gestao-fase1-m3-mais-tools-leitura.md`, `-m4-tools-escrita.md`, `-m5-sql-restrito.md`.

> **Notas de decisão (2026-08-09), tomadas ao escrever este plano contra o código:**
>
> 1. **`horas_por_projeto` não vira tool: vira parâmetro do `status_projeto`.** O §8.1 lista as duas na mesma linha. Hoje o `status_projeto` já devolve `total_horas`, mas acumulado da vida inteira do projeto. Um parâmetro `periodo` opcional responde tanto "quantas horas o Acme consumiu esse mês?" quanto "quantas horas cada projeto consumiu esse mês?" (a tool sem nome de projeto devolve todos os ativos). Uma tool a menos, um modelo mental a menos para o LLM escolher errado. **Se o humano preferir a tool separada, este é o ponto de discordar antes da Task 6.**
>
> 2. **Paridade de coluna não pode ser "mesmas chaves" fora do `listar_equipe`.** O teste existente compara `Object.keys()` da tool com o do endpoint, e isso só funciona porque `listar_equipe` é *pass-through*. As outras tools **renomeiam para português e agregam** (`projeto`, `tarefa`, `total_horas`) — comparar chaves ali daria falha em 100% dos casos sem revelar risco nenhum. O risco que o §18 quer pegar ("a query do admin reusada por outro papel entregando `hourly_rate` ou `sale_value`") é sobre **valor vazado, não sobre nome de chave**. Por isso a Task 2 troca a comparação de chaves por **valores-sentinela**: o fixture planta `hourly_rate = 777.77`, `cost_snapshot = 999999` e `sale_value = 424242`, e o teste exige que o JSON de **toda** tool disponível a papel não-admin não contenha esses valores. É mais forte que a comparação de chaves (pega o vazamento mesmo com a coluna renomeada) e generaliza para as doze. A Task 9 registra essa leitura no §18.
>
> 3. **O estagiário administrativo precisa de fatia de domínio própria.** `prompt.js:21-22` só conhece dois mundos: `admin` recebe `core + admin`, todo o resto recebe `core + employee` — e `employee.md` afirma *"Não há informação financeira nem de custo"*. Isso já é impreciso para o estagiário (ele é aprovador e enxerga `/admin/expense-requests` e `/admin/users` no app), e vira **mentira no prompt** assim que `despesas_do_periodo` entrar, porque ele vê valor de despesa. A Task 3 abre `dominio/administrative_intern.md` antes das tools que dependem disso. Não é refactor oportunista: é pré-requisito das Tasks 4 e 5.
>
> 4. **`espelha` do `listar_equipe` está com o path errado.** O objeto diz `'GET /users'`, mas `routes/users.js` é montado sob `/admin` (`app.js:65`) e o próprio teste bate em `/admin/users`. Como a Task 1 passa a **ler `espelha` para construir a tabela de paridade**, o string errado deixa de ser cosmético. Corrigido na Task 1.
>
> 5. **`despesas_do_periodo` é global, nunca por projeto.** `expense_requests` não tem `project_id` (verificado em `migrations/007_expenses.sql`) — é o mesmo motivo pelo qual a margem saiu da fase. A `description` da tool diz isso explicitamente, para o modelo não tentar cruzar despesa com projeto.

---

## Global Constraints

Herdadas dos M2–M5. Todo task as respeita.

- **Nada de novo é liberado.** Cada tool declara `espelha` e só alcança o que aquele endpoint já alcança, para os mesmos papéis. Se a rota nega o papel, a tool não entra no registry dele.
- **Ambiguidade vira pergunta, não chute (§6).** Projeto sempre por **nome**, resolvido por `tools/projetos.js`; zero resultados ou mais de um viram `Error` legível, que o `loop.js` devolve ao modelo como erro de tool.
- **Escrita nunca executa direto (§10).** `propose` só descreve e valida; `execute` **revalida o estado** (pode ter mudado entre propor e aprovar) e é roteado por `kind` no `WRITE_TOOLS` de `routes/agent.js`.
- **Sem vazar interno (§17).** Erro de banco não sobe cru para a conversa; mensagem curta para o modelo, detalhe no `logger`.
- **Estilo:** ESM, comentários em pt-BR na densidade dos arquivos vizinhos, sem TypeScript. O comentário de cabeçalho de cada tool diz **qual endpoint ela espelha e em que linha**, como nas tools existentes.
- **Testes:** Vitest + Supertest, factories de `src/tests/helpers/`. Integração exige o Postgres de teste (`docker-compose.test.yml`). Rode sempre de dentro de `src/`.
- **Commits:** um por task, mensagem no padrão do repo (`feat(agente): ...`, `test(agente): ...`, `fix(agente): ...`), em português, sem ponto final.

---

## File Structure

**Novas tools**
- `src/lib/agent/tools/read/despesasDoPeriodo.js` — total de despesas aprovadas no período (admin + estagiário).
- `src/lib/agent/tools/read/apontamentosAbertos.js` — quem está com o timer aberto agora (admin + estagiário).
- `src/lib/agent/tools/write/proporPedirFerias.js` — propõe uma solicitação de férias do próprio usuário (todos os papéis).

**Nova lógica compartilhada**
- `src/lib/vacationRequests.js` — `parseVacationPayload`, `hasOverlappingVacation`, `ACTIVE_VACATION_STATUSES`, extraídos de `routes/vacations.js` para a rota e a tool lerem a mesma validação.

**Nova fatia de domínio**
- `src/lib/agent/context/dominio/administrative_intern.md` — o que o estagiário administrativo alcança.

**Modificados**
- `src/lib/agent/prompt.js` — passa a escolher entre três fatias.
- `src/lib/agent/tools/registry.js` — registra as três tools novas.
- `src/lib/agent/tools/read/statusProjeto.js` — parâmetro `periodo` opcional.
- `src/lib/agent/tools/read/listarEquipe.js` — corrige `espelha` para `'GET /admin/users'`.
- `src/routes/agent.js` — `pedir_ferias` no `WRITE_TOOLS`.
- `src/routes/vacations.js` — passa a importar de `lib/vacationRequests.js`.
- `src/lib/agent/context/dominio/core.md` — descreve o período do status e o pedido de férias.
- `src/lib/agent/evals/cases.js` — um caso por tool nova.
- `docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md` — §8.1/§8.3/§18 atualizados.

**Testes**
- `src/tests/integration/agent/paridadePapel.test.js` (novo) — a tabela de paridade de papel.
- `src/tests/integration/agent/paridadeColuna.test.js` (novo) — os valores-sentinela.
- `src/tests/integration/agent/despesasDoPeriodo.test.js`, `apontamentosAbertos.test.js`, `pedirFerias.test.js` (novos).
- `src/tests/integration/agent/statusProjeto.test.js` (ampliado) — recorte por período.
- `src/tests/unit/agent/prompt.test.js` (ampliado) — a fatia do estagiário.
- `src/tests/unit/agent/registry.test.js` (ampliado) — papéis das tools novas.

---

## Task 0: Ponto de partida verde

O HEAD chega até você limpo, com cinco commits recentes de correção de code review (`f7290c7`..`dc2e134`) sobre os milestones M3–M5. Um deles conserta um `import` que impedia o app de subir; outro reescreve o cálculo de horas planejadas. **Esses commits nunca foram validados contra um banco de verdade** — a máquina onde foram escritos estava sem Docker, então só os testes unitários rodaram (127 verdes) mais um check de boot.

Ou seja: esta task não escreve código. Ela existe para você descobrir um vermelho herdado **antes** de começar o trabalho novo, em vez de depurar o erro de outra pessoa achando que é seu.

**Files:**
- Nenhum. Só verificação.

**Interfaces:**
- Consumes: nada.
- Produces: a certeza de que a base está verde — todas as tasks seguintes assumem isso.

- [ ] **Step 1: Confirmar que o tree está limpo**

```bash
git status --porcelain
```

Esperado: nenhuma saída. Se houver alteração pendente, **pare e pergunte** — não é seu trabalho e commitar por cima confunde o histórico.

- [ ] **Step 2: Subir o Postgres de teste e rodar a suíte inteira**

O script sobe o banco, roda tudo e derruba o banco no fim, mesmo se falhar.

```bash
cd src
npm run test:docker
```

Esperado: todos os arquivos passando. Se o Docker não estiver rodando, suba o Docker Desktop e repita — sem banco, só os unit tests rodam, e são justamente os de integração que nunca foram exercitados.

Se algum teste falhar, **pare e reporte** com o comando e a saída. Os arquivos de integração com maior chance de vermelho, porque foram reescritos às cegas, são: `agent/simulacaoPerformance.test.js`, `agent/statusProjeto.test.js`, `agent/andamentoDeProjeto.test.js`, `agent/consultarDados.test.js`, `agent/criarTask.test.js` e `agent/route.test.js`. Um vermelho aí é informação, não obstáculo a contornar.

- [ ] **Step 3: Confirmar que o app sobe em Node puro**

O Vitest faz interop CJS→ESM e já escondeu um erro de módulo que derrubava o servidor. Este check usa a mesma resolução da produção:

```bash
cd src
DATABASE_URL=postgres://x:y@127.0.0.1:5432/z JWT_SECRET=z node -e "import('./app.js').then(()=>console.log('APP OK')).catch(e=>{console.log('APP FAIL:', e.message); process.exit(1)})"
```

Esperado: `APP OK`. O mesmo check está automatizado em `tests/unit/bootEsm.test.js` e já roda dentro da suíte; este passo é só para você ver com os próprios olhos antes de confiar na base.

---

## Task 1: Paridade de papel — a tabela que cobre as doze tools

Este é o teste que sustenta o §3.1. A pergunta que ele responde é uma só: **para cada tool, o conjunto de papéis em `tool.roles` é exatamente o conjunto de papéis que o endpoint espelhado aceita?** Se uma tool for oferecida a um papel que a rota nega, o agente virou uma porta lateral — e é isso que precisa falhar em vermelho.

**Files:**
- Create: `src/tests/integration/agent/paridadePapel.test.js`
- Modify: `src/lib/agent/tools/read/listarEquipe.js` (campo `espelha`)

**Interfaces:**
- Consumes: `asUser` de `src/tests/helpers/api.js`; `makeUser`, `makeProject` de `src/tests/helpers/factories.js`; os módulos de tool em `src/lib/agent/tools/**`.
- Produces: nada que outra task importe. É um teste terminal.

- [ ] **Step 1: Corrigir o `espelha` do `listar_equipe`**

O objeto diz `'GET /users'`, mas `routes/users.js` é montado sob `/admin` (`app.js:65`). Em `src/lib/agent/tools/read/listarEquipe.js`, troque o campo:

```js
export default {
  kind: 'read', espelha: 'GET /admin/users',
  roles: ['admin', 'administrative_intern'],
  definition, run,
}
```

- [ ] **Step 2: Escrever o teste de paridade de papel**

Crie `src/tests/integration/agent/paridadePapel.test.js`:

```js
// O §18 do design chama isto de "teste de paridade" e diz que é o que sustenta
// a decisão do §3.1 (recorte por papel em código, sem RLS no Postgres). A
// pergunta é uma só: os papéis que a tool aceita são exatamente os que o
// endpoint espelhado aceita? Se a tool aceitar um papel a mais, o agente virou
// porta lateral para uma rota fechada.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../../helpers/db.js'
import { asUser } from '../../helpers/api.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import { buildRegistry } from '../../../lib/agent/tools/registry.js'

import listarEquipe from '../../../lib/agent/tools/read/listarEquipe.js'
import custoPorProjeto from '../../../lib/agent/tools/read/custoPorProjeto.js'
import cargaEquipe from '../../../lib/agent/tools/read/cargaEquipe.js'
import quemNaoApontou from '../../../lib/agent/tools/read/quemNaoApontou.js'
import tasksTravadas from '../../../lib/agent/tools/read/tasksTravadas.js'
import feriasEConflitos from '../../../lib/agent/tools/read/feriasEConflitos.js'
import simulacaoPerformance from '../../../lib/agent/tools/read/simulacaoPerformance.js'
import statusProjeto from '../../../lib/agent/tools/read/statusProjeto.js'
import andamentoDeProjeto from '../../../lib/agent/tools/read/andamentoDeProjeto.js'
import proporCriarApontamento from '../../../lib/agent/tools/write/proporCriarApontamento.js'
import proporEncerrarApontamento from '../../../lib/agent/tools/write/proporEncerrarApontamento.js'
import proporCriarTask from '../../../lib/agent/tools/write/proporCriarTask.js'

const PAPEIS = ['admin', 'administrative_intern', 'project_manager', 'employee']

// Só 401/403 contam como negação de PAPEL. 400/404/409 são o endpoint
// funcionando e reclamando do corpo ou do estado — o papel passou.
const NEGADO = new Set([401, 403])

// Datas exigidas pelos relatórios financeiros (reports.js:98).
const JANELA = 'start_date=2020-01-01&end_date=2030-12-31'

// Cada entrada liga a tool aos endpoints que ela declara espelhar. `chamar`
// devolve uma lista de requests; o papel só é considerado permitido se NENHUM
// deles negar (o status_projeto espelha dois endpoints).
const CASOS = [
  { tool: listarEquipe, chamar: (u) => [asUser(u).get('/admin/users')] },
  { tool: custoPorProjeto, chamar: (u) => [asUser(u).get(`/admin/reports/project-cost?${JANELA}`)] },
  { tool: cargaEquipe, chamar: (u) => [asUser(u).get(`/admin/reports/financial?${JANELA}`)] },
  { tool: quemNaoApontou, chamar: (u) => [asUser(u).get(`/admin/reports/financial?${JANELA}`)] },
  { tool: tasksTravadas, chamar: (u) => [asUser(u).get('/tasks')] },
  { tool: feriasEConflitos, chamar: (u) => [asUser(u).get('/vacation-calendar')] },
  { tool: simulacaoPerformance, chamar: (u) => [asUser(u).get('/me/simulation?month=2026-03')] },
  { tool: statusProjeto, chamar: (u) => [asUser(u).get('/projects'), asUser(u).get('/tasks/counts')] },
  { tool: andamentoDeProjeto, chamar: (u) => [asUser(u).get('/tasks')] },
  {
    tool: proporCriarApontamento,
    chamar: (u, ctx) => [asUser(u).post('/time-entries/start').send({ project_id: ctx.projeto.id })],
  },
  { tool: proporEncerrarApontamento, chamar: (u) => [asUser(u).post('/time-entries/stop').send({})] },
  {
    tool: proporCriarTask,
    chamar: (u, ctx) => [asUser(u).post(`/projects/${ctx.projeto.id}/tasks`).send({ title: 'paridade' })],
  },
]

describe('paridade de papel: tool ↔ endpoint espelhado (§18)', () => {
  let usuarios, ctx
  beforeEach(async () => {
    await resetDb()
    usuarios = {}
    for (const papel of PAPEIS) {
      usuarios[papel] = await makeUser({ role: papel, name: `Papel ${papel}` })
    }
    ctx = { projeto: await makeProject({ name: 'Paridade' }) }
  })

  for (const caso of CASOS) {
    const nome = caso.tool.definition.function.name
    it(`${nome}: aceita exatamente os papéis que ${caso.tool.espelha} aceita`, async () => {
      for (const papel of PAPEIS) {
        const respostas = await Promise.all(caso.chamar(usuarios[papel], ctx))
        const endpointPermite = respostas.every((r) => !NEGADO.has(r.status))
        const toolPermite = caso.tool.roles.includes(papel)
        expect(
          { papel, tool: toolPermite, endpoint: endpointPermite },
          `${nome} diverge de ${caso.tool.espelha} para o papel ${papel}`,
        ).toEqual({ papel, tool: endpointPermite, endpoint: endpointPermite })
      }
    })
  }

  it('toda tool com `espelha` está na tabela — nenhuma escapa do teste', () => {
    // O admin enxerga o catálogo inteiro, então é a régua da cobertura.
    const todas = buildRegistry({ role: 'admin' }).definitions.map((d) => d.function.name)
    const naTabela = new Set(CASOS.map((c) => c.tool.definition.function.name))
    // consultar_dados tem espelha:null de propósito (§8.2) — não entra.
    const faltando = todas.filter((n) => n !== 'consultar_dados' && !naTabela.has(n))
    expect(faltando).toEqual([])
  })
})
```

- [ ] **Step 3: Rodar e ver passar**

```bash
cd src
npm run test:docker -- tests/integration/agent/paridadePapel.test.js
```

Esperado: todos os casos verdes. Se algum divergir, **não ajuste o teste para passar** — a divergência é o achado. Reporte qual tool e qual papel, com o status HTTP que o endpoint devolveu.

- [ ] **Step 4: Provar que o teste pega a regressão**

Um teste de invariante que nunca ficou vermelho não vale nada. Adicione temporariamente `'employee'` a `roles` em `src/lib/agent/tools/read/custoPorProjeto.js`:

```js
  roles: ['admin', 'employee'],
```

Rode de novo:

```bash
cd src
npm run test:docker -- tests/integration/agent/paridadePapel.test.js
```

Esperado: FALHA em `custo_por_projeto: aceita exatamente os papéis que GET /admin/reports/project-cost aceita`, com a mensagem apontando o papel `employee`.

**Desfaça a alteração** (`roles: ['admin']`) e rode outra vez para voltar ao verde.

- [ ] **Step 5: Commit**

```bash
git add src/tests/integration/agent/paridadePapel.test.js src/lib/agent/tools/read/listarEquipe.js
git commit -m "test(agente): paridade de papel cobre as 12 tools com espelha (§18)"
```

---

## Task 2: Paridade de coluna por valor-sentinela

O teste de chaves do `listarEquipe.test.js` não generaliza: as outras tools renomeiam para português e agregam. O risco que o §18 descreve, porém, não é o nome da chave — é **o valor financeiro chegando a quem não pode vê-lo**. Este teste planta valores improváveis no fixture e exige que eles não apareçam na saída de nenhuma tool disponível a papel não-admin.

**Files:**
- Create: `src/tests/integration/agent/paridadeColuna.test.js`

**Interfaces:**
- Consumes: `buildRegistry` de `src/lib/agent/tools/registry.js`; `query`, `resetDb` de `src/tests/helpers/db.js`; factories.
- Produces: nada que outra task importe.

- [ ] **Step 1: Escrever o teste**

Crie `src/tests/integration/agent/paridadeColuna.test.js`:

```js
// Paridade de COLUNA, generalizada. Comparar Object.keys() com o endpoint só
// funciona para tool pass-through (listar_equipe); as demais renomeiam para
// português e agregam. O que o §18 quer pegar é o VALOR financeiro chegando a
// quem não pode ver, então plantamos valores improváveis no fixture e exigimos
// que não apareçam no JSON de nenhuma tool oferecida a papel não-admin.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import { buildRegistry } from '../../../lib/agent/tools/registry.js'

const SENTINELAS = {
  hourly_rate: 777.77,
  cost_snapshot: 999999,
  sale_value: 424242,
}

// Papéis que NÃO têm acesso a dinheiro (permissions.canAccessMoney = só admin).
const SEM_DINHEIRO = ['administrative_intern', 'project_manager', 'employee']

// Argumentos plausíveis por tool, para o `run` chegar até o fim em vez de parar
// num erro de parâmetro (que não exercitaria a query).
const ARGS = {
  status_projeto: { projeto: 'Sentinela' },
  andamento_de_projeto: { projeto: 'Sentinela' },
  simulacao_performance: {},
  tasks_travadas: {},
  ferias_e_conflitos: {},
  listar_equipe: {},
  custo_por_projeto: {},
  carga_equipe: {},
  quem_nao_apontou: {},
  despesas_do_periodo: {},
  apontamentos_abertos: {},
}

describe('paridade de coluna: valor financeiro não vaza por papel (§18)', () => {
  let projeto
  beforeEach(async () => {
    await resetDb()
    projeto = await makeProject({ name: 'Sentinela' })
    await query('UPDATE projects SET sale_value = $1 WHERE id = $2', [SENTINELAS.sale_value, projeto.id])
    const dono = await makeUser({ role: 'employee', name: 'Dono', hourly_rate: SENTINELAS.hourly_rate })
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, ended_at, status, duration_minutes, cost_snapshot)
       VALUES ($1, $2, now(), now(), 'completed', 60, $3)`,
      [dono.id, projeto.id, SENTINELAS.cost_snapshot],
    )
    await query(
      `INSERT INTO tasks (project_id, title, status, position) VALUES ($1, 'T', 'in_review', 0)`,
      [projeto.id],
    )
  })

  for (const papel of SEM_DINHEIRO) {
    it(`${papel}: nenhuma tool devolve valor financeiro plantado`, async () => {
      const perfil = await makeUser({ role: papel, name: `Quem ${papel}` })
      const registry = buildRegistry(perfil)

      for (const definicao of registry.definitions) {
        const nome = definicao.function.name
        const tool = registry.get(nome)
        if (tool.kind !== 'read') continue // escrita não devolve linha; é a Task 1 que cobre papel
        if (nome === 'consultar_dados') continue // admin-only; nunca cai aqui

        let saida
        try {
          saida = await tool.run(perfil, ARGS[nome] ?? {})
        } catch {
          continue // erro legível (ex.: projeto ambíguo) não é vazamento
        }
        const json = JSON.stringify(saida.data)
        for (const [coluna, valor] of Object.entries(SENTINELAS)) {
          expect(json, `${nome} vazou ${coluna} para ${papel}`).not.toContain(String(valor))
        }
      }
    })
  }

  it('admin: o sentinela APARECE — prova que o fixture chega às tools', async () => {
    const admin = await makeUser({ role: 'admin', name: 'Chefe' })
    const registry = buildRegistry(admin)
    const custo = await registry.get('custo_por_projeto').run(admin, {})
    expect(JSON.stringify(custo.data)).toContain(String(SENTINELAS.cost_snapshot))
  })
})
```

- [ ] **Step 2: Rodar**

```bash
cd src
npm run test:docker -- tests/integration/agent/paridadeColuna.test.js
```

Esperado: verde. O último caso (admin) é o controle: se ele falhar, o fixture não está chegando às tools e os outros casos estão passando por vacuidade — conserte o fixture, não a asserção.

- [ ] **Step 3: Provar que pega a regressão**

Em `src/lib/agent/tools/read/tasksTravadas.js`, adicione temporariamente `u.hourly_rate` ao `SELECT` e ao objeto devolvido. Rode o teste: deve **falhar** para os três papéis com a mensagem `tasks_travadas vazou hourly_rate para ...`. Desfaça e volte ao verde.

- [ ] **Step 4: Commit**

```bash
git add src/tests/integration/agent/paridadeColuna.test.js
git commit -m "test(agente): paridade de coluna por valor-sentinela cobre todas as tools de leitura"
```

---

## Task 3: Fatia de domínio do estagiário administrativo

`prompt.js` só conhece `admin` e "todo o resto", e a fatia do resto diz que não há informação financeira. Isso já é impreciso para o estagiário — que é aprovador — e vira mentira assim que ele receber `despesas_do_periodo` (Task 4). Esta task abre a terceira fatia, e é **pré-requisito das Tasks 4 e 5**.

**Files:**
- Create: `src/lib/agent/context/dominio/administrative_intern.md`
- Modify: `src/lib/agent/prompt.js:20-24`
- Test: `src/tests/unit/agent/prompt.test.js`

**Interfaces:**
- Consumes: `slice()` já existente em `prompt.js`.
- Produces: `buildSystemPrompt({ role: 'administrative_intern' })` passa a devolver `core + administrative_intern`. As Tasks 4 e 5 escrevem nesse arquivo novo.

- [ ] **Step 1: Escrever o teste que falha**

Acrescente ao final do `describe` em `src/tests/unit/agent/prompt.test.js`:

```js
  it('estagiário administrativo tem fatia própria: aprova pedidos, mas não vê custo de hora', () => {
    const p = buildSystemPrompt({ role: 'administrative_intern' })
    expect(p).toMatch(/aprovador|aprova/i)
    // Ele vê valor de despesa (é quem aprova), mas não o custo/hora das pessoas:
    expect(p).not.toMatch(/valor\/hora|hourly_rate|cost_snapshot/i)
    // E não recebe a fatia do colaborador, que nega TODA informação financeira:
    expect(p).not.toMatch(/Não há informação financeira nem de custo/i)
  })
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd src
npx vitest run tests/unit/agent/prompt.test.js
```

Esperado: FALHA — o estagiário recebe hoje a fatia do colaborador, que contém exatamente a frase negada.

- [ ] **Step 3: Criar a fatia**

Crie `src/lib/agent/context/dominio/administrative_intern.md`:

```markdown
<!-- Domínio — fatia do estagiário administrativo -->
# Domínio — fatia do estagiário administrativo

Você é o assistente de alguém que trabalha na **operação**: é **aprovador** de
solicitações (despesas e férias) e acompanha o dia a dia da equipe.

## O que você alcança
- **pessoas do time**: nome, papel, cargo e situação — sem nenhuma coluna de dinheiro
  da pessoa (valor por hora e salário não aparecem para você).
- **despesas aprovadas no período**: total e quebra por pessoa. O valor da despesa você
  vê, porque é você quem aprova.
- **quem está apontando agora**: quem tem o timer aberto ou pausado neste momento.

## O que você NÃO alcança
Custo de projeto, custo por hora das pessoas, folha e relatórios financeiros são só do
administrador. Se perguntarem, diga que não tem esse dado — não estime.
```

- [ ] **Step 4: Ligar a fatia no `prompt.js`**

Substitua o corpo de `buildSystemPrompt` em `src/lib/agent/prompt.js`:

```js
// Três mundos, não dois: o estagiário administrativo é aprovador (vê valor de
// despesa) mas não alcança custo/hora — a fatia do colaborador negaria as duas
// coisas de uma vez e mentiria no prompt.
const FATIA_POR_PAPEL = {
  admin: 'admin',
  administrative_intern: 'administrative_intern',
}

export function buildSystemPrompt(profile) {
  const fatia = FATIA_POR_PAPEL[profile?.role] || 'employee'
  return `${REGRAS}\n\n${slice('core')}\n\n${slice(fatia)}`
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd src
npx vitest run tests/unit/agent/prompt.test.js
```

Esperado: PASS, inclusive os casos antigos (o admin continua com `core + admin`, e `project_manager`/`employee` com `core + employee`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/context/dominio/administrative_intern.md src/lib/agent/prompt.js src/tests/unit/agent/prompt.test.js
git commit -m "feat(agente): fatia de dominio propria do estagiario administrativo (§5)"
```

---

## Task 4: Tool `despesas_do_periodo`

**Files:**
- Create: `src/lib/agent/tools/read/despesasDoPeriodo.js`
- Create: `src/tests/integration/agent/despesasDoPeriodo.test.js`
- Modify: `src/lib/agent/tools/registry.js`, `src/lib/agent/context/dominio/admin.md`, `src/lib/agent/context/dominio/administrative_intern.md`, `src/lib/agent/evals/cases.js`, `src/tests/integration/agent/paridadePapel.test.js`, `src/tests/unit/agent/registry.test.js`

**Interfaces:**
- Consumes: `query` de `src/lib/db.js`; `resolvePeriodo(nome)` de `src/lib/agent/format.js`, que devolve `{ inicio, fim }` como strings `YYYY-MM-DD`.
- Produces: default export `{ kind:'read', espelha:'GET /admin/expense-requests', roles:['admin','administrative_intern'], definition, run }`, com `run(profile, args) → { data, count }`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/tests/integration/agent/despesasDoPeriodo.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/read/despesasDoPeriodo.js'

// Data de hoje no fuso do estúdio — casa com a janela de resolvePeriodo('mes').
function hojeSP() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

async function makeDespesa({ user_id, amount, status, expense_date }) {
  await query(
    `INSERT INTO expense_requests (user_id, title, amount, expense_date, status)
     VALUES ($1, 'Despesa', $2, $3, $4)`,
    [user_id, amount, expense_date, status],
  )
}

describe('tool despesas_do_periodo (admin + estagiário)', () => {
  let admin, ana, hoje
  beforeEach(async () => {
    await resetDb()
    admin = await makeUser({ role: 'admin', name: 'Chefe' })
    ana = await makeUser({ role: 'employee', name: 'Ana' })
    hoje = hojeSP()
    await makeDespesa({ user_id: ana.id, amount: 100.5, status: 'approved', expense_date: hoje })
    await makeDespesa({ user_id: ana.id, amount: 200, status: 'approved', expense_date: hoje })
    // Ruído que NÃO pode entrar na soma:
    await makeDespesa({ user_id: ana.id, amount: 999, status: 'pending', expense_date: hoje })
    await makeDespesa({ user_id: ana.id, amount: 888, status: 'rejected', expense_date: hoje })
    await makeDespesa({ user_id: ana.id, amount: 777, status: 'approved', expense_date: '2020-01-15' })
  })

  it('soma só as APROVADAS do período e quebra por pessoa', async () => {
    const { data } = await tool.run(admin, { periodo: 'mes' })
    expect(data.total_aprovado).toBe(300.5)
    expect(data.quantidade).toBe(2)
    expect(data.por_pessoa).toEqual([{ pessoa: 'Ana', quantidade: 2, total: 300.5 }])
  })

  it('período sem despesa aprovada devolve zero, não erro', async () => {
    const { data, count } = await tool.run(admin, { periodo: 'hoje' })
    expect(typeof data.total_aprovado).toBe('number')
    expect(count).toBe(data.por_pessoa.length)
  })

  it('é oferecida ao admin e ao estagiário, e a mais ninguém', () => {
    expect(tool.roles).toEqual(['admin', 'administrative_intern'])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd src
npm run test:docker -- tests/integration/agent/despesasDoPeriodo.test.js
```

Esperado: FALHA com `Cannot find module '.../despesasDoPeriodo.js'`.

- [ ] **Step 3: Escrever a tool**

Crie `src/lib/agent/tools/read/despesasDoPeriodo.js`:

```js
// Espelha GET /admin/expense-requests (expenses.js:130, requireAuth +
// requireApprover = admin + estagiário administrativo): total de despesas
// APROVADAS no período. GLOBAL, nunca por projeto — expense_requests não tem
// project_id (007_expenses.sql), então qualquer recorte por projeto seria
// número inventado. É o que sobrou do resumo_financeiro depois que receita e
// margem saíram da fase (§8.1).
import { query } from '../../../db.js'
import { resolvePeriodo } from '../../format.js'

const definition = {
  type: 'function',
  function: {
    name: 'despesas_do_periodo',
    description: 'Total de despesas APROVADAS no período, com quebra por pessoa. É sempre global: despesa não é atribuível a projeto neste sistema, então não tente cruzar com projeto.',
    parameters: {
      type: 'object',
      properties: {
        periodo: { type: 'string', enum: ['hoje', 'semana', 'mes'], description: 'período; padrão mes' },
      },
      additionalProperties: false,
    },
  },
}

const dinheiro = (n) => Number(Number(n || 0).toFixed(2))

async function run(_profile, args) {
  const { inicio, fim } = resolvePeriodo(args?.periodo || 'mes')
  const { rows } = await query(
    `SELECT u.name AS pessoa, COUNT(*)::int AS quantidade, COALESCE(SUM(e.amount), 0) AS total
       FROM expense_requests e
       JOIN users u ON u.id = e.user_id
      WHERE e.status = 'approved'
        AND e.expense_date >= $1::date
        AND e.expense_date <= $2::date
      GROUP BY u.name
      ORDER BY total DESC, pessoa`,
    [inicio, fim],
  )
  const data = {
    periodo: { inicio, fim },
    total_aprovado: dinheiro(rows.reduce((s, r) => s + Number(r.total), 0)),
    quantidade: rows.reduce((s, r) => s + r.quantidade, 0),
    por_pessoa: rows.map((r) => ({
      pessoa: r.pessoa,
      quantidade: r.quantidade,
      total: dinheiro(r.total),
    })),
  }
  return { data, count: rows.length }
}

export default {
  kind: 'read', espelha: 'GET /admin/expense-requests',
  roles: ['admin', 'administrative_intern'],
  definition, run,
}
```

- [ ] **Step 4: Registrar no registry**

Em `src/lib/agent/tools/registry.js`, adicione o import e a entrada em `TODAS`:

```js
import despesasDoPeriodo from './read/despesasDoPeriodo.js'
```

```js
const TODAS = [
  listarEquipe, proporEncerrarApontamento, proporCriarApontamento, proporCriarTask,
  custoPorProjeto, cargaEquipe, quemNaoApontou, tasksTravadas, feriasEConflitos,
  simulacaoPerformance, statusProjeto, andamentoDeProjeto,
  despesasDoPeriodo,
  consultarDados,
]
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd src
npm run test:docker -- tests/integration/agent/despesasDoPeriodo.test.js
```

Esperado: PASS nos três casos.

- [ ] **Step 6: Descrever no domínio (as duas fatias que a alcançam)**

Em `src/lib/agent/context/dominio/admin.md`, dentro de `## Inteligência de gestão (só admin)`, acrescente:

```markdown
- **despesas do período**: total das despesas APROVADAS no período, com quebra por pessoa.
  É sempre global — despesa não tem projeto neste sistema, então não prometa despesa por projeto.
```

Em `src/lib/agent/context/dominio/administrative_intern.md`, o item "despesas aprovadas no período" já está descrito pela Task 3 — confira que continua batendo com o que a tool devolve e ajuste a redação se divergir.

- [ ] **Step 7: Eval + paridade + registry**

Em `src/lib/agent/evals/cases.js`, adicione ao array:

```js
  { nome: 'despesas do período (admin)', papel: 'admin', pergunta: 'quanto saiu de despesa aprovada esse mês?', espera: { toolEsperada: 'despesas_do_periodo' } },
  { nome: 'despesa por projeto não existe', papel: 'admin', pergunta: 'quanto de despesa foi para o projeto Acme?', espera: { pedirEsclarecimento: true, naoInventar: true } },
```

Em `src/tests/integration/agent/paridadePapel.test.js`, importe a tool e adicione o caso:

```js
import despesasDoPeriodo from '../../../lib/agent/tools/read/despesasDoPeriodo.js'
```

```js
  { tool: despesasDoPeriodo, chamar: (u) => [asUser(u).get('/admin/expense-requests')] },
```

Em `src/tests/unit/agent/registry.test.js`, adicione:

```js
describe('registry — despesas_do_periodo (admin + estagiário)', () => {
  it('admin e estagiário recebem; gestor e colaborador não', () => {
    for (const role of ['admin', 'administrative_intern']) {
      const nomes = buildRegistry({ role }).definitions.map((d) => d.function.name)
      expect(nomes).toContain('despesas_do_periodo')
    }
    for (const role of ['project_manager', 'employee']) {
      const nomes = buildRegistry({ role }).definitions.map((d) => d.function.name)
      expect(nomes).not.toContain('despesas_do_periodo')
    }
  })
})
```

- [ ] **Step 8: Rodar a suíte inteira**

```bash
cd src
npm run test:docker
```

Esperado: tudo verde, incluindo o novo caso de paridade de papel.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(agente): tool despesas_do_periodo (admin + estagiario), global por definicao"
```

---

## Task 5: Tool `apontamentos_abertos`

**Files:**
- Create: `src/lib/agent/tools/read/apontamentosAbertos.js`
- Create: `src/tests/integration/agent/apontamentosAbertos.test.js`
- Modify: `src/lib/agent/tools/registry.js`, `src/lib/agent/context/dominio/admin.md`, `src/lib/agent/evals/cases.js`, `src/tests/integration/agent/paridadePapel.test.js`

**Interfaces:**
- Consumes: `query` de `src/lib/db.js`.
- Produces: default export `{ kind:'read', espelha:'GET /admin/live', roles:['admin','administrative_intern'], definition, run }`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/tests/integration/agent/apontamentosAbertos.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/read/apontamentosAbertos.js'

describe('tool apontamentos_abertos (admin + estagiário)', () => {
  let admin, ana, bruno, carla, proj
  beforeEach(async () => {
    await resetDb()
    admin = await makeUser({ role: 'admin', name: 'Chefe' })
    ana = await makeUser({ role: 'employee', name: 'Ana' })
    bruno = await makeUser({ role: 'employee', name: 'Bruno' })
    carla = await makeUser({ role: 'employee', name: 'Carla' })
    proj = await makeProject({ name: 'Acme' })
    // Ana está rodando há 2h; Bruno está pausado; Carla já encerrou.
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, status)
       VALUES ($1, $2, now() - interval '2 hours', 'running')`,
      [ana.id, proj.id],
    )
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, status)
       VALUES ($1, $2, now() - interval '30 minutes', 'paused')`,
      [bruno.id, proj.id],
    )
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, ended_at, status, duration_minutes, cost_snapshot)
       VALUES ($1, $2, now() - interval '5 hours', now(), 'completed', 60, 0)`,
      [carla.id, proj.id],
    )
  })

  it('lista só quem está com o timer aberto (running ou paused)', async () => {
    const { data, count } = await tool.run(admin, {})
    expect(count).toBe(2)
    const nomes = data.map((r) => r.pessoa).sort()
    expect(nomes).toEqual(['Ana', 'Bruno'])
    expect(nomes).not.toContain('Carla')
  })

  it('traz projeto, status e há quanto tempo está aberto', async () => {
    const { data } = await tool.run(admin, {})
    const linhaAna = data.find((r) => r.pessoa === 'Ana')
    expect(linhaAna.status).toBe('running')
    expect(linhaAna.projeto).toBe('Acme')
    expect(linhaAna.horas_em_aberto).toBeGreaterThanOrEqual(1.9)
    expect(linhaAna.horas_em_aberto).toBeLessThan(2.2)
  })

  it('não devolve nada de dinheiro', async () => {
    const { data } = await tool.run(admin, {})
    const chaves = Object.keys(data[0])
    expect(chaves).not.toContain('cost_snapshot')
    expect(chaves).not.toContain('hourly_rate')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd src
npm run test:docker -- tests/integration/agent/apontamentosAbertos.test.js
```

Esperado: FALHA com módulo não encontrado.

- [ ] **Step 3: Escrever a tool**

Crie `src/lib/agent/tools/read/apontamentosAbertos.js`:

```js
// Espelha GET /admin/live (timeEntries.js:560, requireAuth +
// requireOperationalAccess = admin + estagiário administrativo). Diferença
// deliberada de recorte: o endpoint lista TODO mundo e marca 'offline' quem não
// tem apontamento, porque alimenta um painel; a pergunta de gestão é "quem está
// apontando agora?", então a tool devolve só as linhas abertas. É recorte para
// menos, não para mais — nenhuma linha nova é exposta.
import { query } from '../../../db.js'

const definition = {
  type: 'function',
  function: {
    name: 'apontamentos_abertos',
    description: 'Quem está com o apontamento aberto agora (timer rodando ou pausado): pessoa, projeto, status e há quanto tempo. Use para "quem está trabalhando agora?".',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
}

async function run() {
  const { rows } = await query(
    `SELECT u.name AS pessoa, te.status, p.name AS projeto, te.started_at AS desde,
            EXTRACT(EPOCH FROM (now() - te.started_at)) / 3600 AS horas
       FROM time_entries te
       JOIN users u ON u.id = te.user_id
       LEFT JOIN projects p ON p.id = te.project_id
      WHERE te.status IN ('running', 'paused')
        AND u.deleted_at IS NULL AND u.is_active = true
      ORDER BY te.started_at`,
  )
  const data = rows.map((r) => ({
    pessoa: r.pessoa,
    status: r.status,
    projeto: r.projeto || null,
    desde: r.desde,
    horas_em_aberto: Number(Number(r.horas).toFixed(2)),
  }))
  return { data, count: data.length }
}

export default {
  kind: 'read', espelha: 'GET /admin/live',
  roles: ['admin', 'administrative_intern'],
  definition, run,
}
```

- [ ] **Step 4: Registrar e rodar**

Em `src/lib/agent/tools/registry.js`, adicione `import apontamentosAbertos from './read/apontamentosAbertos.js'` e inclua `apontamentosAbertos` no array `TODAS`, ao lado de `despesasDoPeriodo`.

```bash
cd src
npm run test:docker -- tests/integration/agent/apontamentosAbertos.test.js
```

Esperado: PASS nos três casos.

- [ ] **Step 5: Domínio, eval e paridade**

Em `src/lib/agent/context/dominio/admin.md`, dentro de `## Inteligência de gestão (só admin)`:

```markdown
- **apontamentos abertos**: quem está com o timer rodando ou pausado agora, em qual projeto
  e há quanto tempo.
```

Em `src/lib/agent/context/dominio/administrative_intern.md` o item já existe ("quem está apontando agora") — confira a redação.

Em `src/lib/agent/evals/cases.js`:

```js
  { nome: 'quem está apontando agora (estagiário)', papel: 'administrative_intern', pergunta: 'quem está com o timer aberto agora?', espera: { toolEsperada: 'apontamentos_abertos' } },
```

Em `src/tests/integration/agent/paridadePapel.test.js`, importe e adicione:

```js
import apontamentosAbertos from '../../../lib/agent/tools/read/apontamentosAbertos.js'
```

```js
  { tool: apontamentosAbertos, chamar: (u) => [asUser(u).get('/admin/live')] },
```

- [ ] **Step 6: Suíte inteira + commit**

```bash
cd src
npm run test:docker
git add -A
git commit -m "feat(agente): tool apontamentos_abertos (admin + estagiario), espelha GET /admin/live"
```

---

## Task 6: `status_projeto` ganha recorte por período

Absorve o `horas_por_projeto(periodo)` do §8.1. Sem `periodo`, o comportamento atual não muda (horas acumuladas do projeto); com `periodo`, as horas passam a ser as do intervalo, e a tool sem nome de projeto responde "quantas horas cada projeto ativo consumiu no período".

**Files:**
- Modify: `src/lib/agent/tools/read/statusProjeto.js`
- Modify: `src/tests/integration/agent/statusProjeto.test.js`
- Modify: `src/lib/agent/context/dominio/core.md`, `src/lib/agent/evals/cases.js`

**Interfaces:**
- Consumes: `resolvePeriodo` de `src/lib/agent/format.js`; `resolverProjeto` de `src/lib/agent/tools/projetos.js`.
- Produces: mesma assinatura de export; `run` passa a aceitar `{ projeto?, periodo? }` e o objeto de saída ganha a chave `periodo` (`{inicio, fim}` ou `null`).

- [ ] **Step 1: Escrever o teste que falha**

Acrescente ao `describe` de `src/tests/integration/agent/statusProjeto.test.js`:

```js
  it('com período, conta só as horas apontadas na janela', async () => {
    // O fixture já tem 120 min de hoje. Este é de um ano atrás:
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, ended_at, status, duration_minutes, cost_snapshot)
       VALUES ($1, $2, now() - interval '1 year', now() - interval '1 year', 'completed', 600, 0)`,
      [emp.id, proj.id],
    )

    const semPeriodo = await tool.run(emp, { projeto: 'Projeto A' })
    expect(semPeriodo.data[0].total_horas).toBe(12) // 120 + 600 min
    expect(semPeriodo.data[0].periodo).toBeNull()

    const comPeriodo = await tool.run(emp, { projeto: 'Projeto A', periodo: 'mes' })
    expect(comPeriodo.data[0].total_horas).toBe(2) // só os 120 min deste mês
    expect(comPeriodo.data[0].periodo).toEqual(expect.objectContaining({ inicio: expect.any(String) }))
  })
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd src
npm run test:docker -- tests/integration/agent/statusProjeto.test.js
```

Esperado: FALHA — hoje `total_horas` ignora `periodo` e a chave `periodo` não existe.

- [ ] **Step 3: Implementar**

Em `src/lib/agent/tools/read/statusProjeto.js`, importe `resolvePeriodo`:

```js
import { resolvePeriodo } from '../../format.js'
```

Acrescente o parâmetro na `definition`:

```js
      properties: {
        projeto: { type: 'string', description: 'nome do projeto; se omitido, traz todos os projetos ativos' },
        periodo: { type: 'string', enum: ['hoje', 'semana', 'mes'], description: 'recorta as horas apontadas ao período; se omitido, traz o acumulado do projeto' },
      },
```

Substitua o corpo de `run`:

```js
async function run(_profile, args) {
  const alvo = (args?.projeto || '').trim()
  const id = alvo ? (await resolverProjeto(alvo)).id : null
  // Sem período, o LATERAL soma a vida inteira do projeto (os dois $ ficam
  // nulos e as duas condições viram verdade).
  const janela = args?.periodo ? resolvePeriodo(args.periodo) : null

  const { rows } = await query(
    `SELECT p.id AS projeto_id, p.name AS projeto, COALESCE(c.name, p.client) AS cliente, p.status,
            tc.todo, tc.in_progress, tc.in_review, tc.done, tc.abandoned, tc.total_tarefas,
            COALESCE(hc.total_minutes, 0) AS total_minutes
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS total_tarefas,
                COUNT(*) FILTER (WHERE status = 'todo')::int        AS todo,
                COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
                COUNT(*) FILTER (WHERE status = 'in_review')::int   AS in_review,
                COUNT(*) FILTER (WHERE status = 'done')::int        AS done,
                COUNT(*) FILTER (WHERE status = 'abandoned')::int   AS abandoned
           FROM tasks WHERE project_id = p.id
       ) tc ON true
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(duration_minutes),0)::int AS total_minutes
           FROM time_entries
          WHERE project_id = p.id AND status = 'completed'
            AND ($2::date IS NULL OR started_at >= ($2::date AT TIME ZONE 'America/Sao_Paulo'))
            AND ($3::date IS NULL OR started_at < (($3::date + interval '1 day') AT TIME ZONE 'America/Sao_Paulo'))
       ) hc ON true
      WHERE p.deleted_at IS NULL
        AND ($1::uuid IS NULL OR p.id = $1::uuid)
        AND ($1::uuid IS NOT NULL OR p.status = 'active')
      ORDER BY p.name`,
    [id, janela?.inicio ?? null, janela?.fim ?? null],
  )
  const data = rows.map((r) => ({
    projeto_id: r.projeto_id,
    projeto: r.projeto,
    cliente: r.cliente || null,
    status: r.status,
    periodo: janela,
    tarefas: {
      todo: r.todo, in_progress: r.in_progress, in_review: r.in_review,
      done: r.done, abandoned: r.abandoned, total: r.total_tarefas,
    },
    total_horas: Number((r.total_minutes / 60).toFixed(2)),
  }))
  return { data, count: data.length }
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd src
npm run test:docker -- tests/integration/agent/statusProjeto.test.js
```

Esperado: PASS, inclusive os casos antigos (sem `periodo`, `total_horas` continua sendo o acumulado).

- [ ] **Step 5: Domínio e eval**

Em `src/lib/agent/context/dominio/core.md`, substitua o item do status do projeto por:

```markdown
- **status do projeto**: retrato de um projeto — status (ativo/concluído), tarefas por
  coluna do kanban e horas apontadas. Peça um período (hoje, semana, mês) para saber
  quantas horas o projeto consumiu **naquele intervalo**; sem período, as horas são o
  acumulado do projeto inteiro. Sem nome de projeto, vale para todos os ativos — é assim
  que se compara o consumo de horas entre projetos.
```

Em `src/lib/agent/evals/cases.js`:

```js
  { nome: 'horas por projeto no mês (admin)', papel: 'admin', pergunta: 'quantas horas cada projeto consumiu esse mês?', espera: { toolEsperada: 'status_projeto' } },
```

- [ ] **Step 6: Suíte inteira + commit**

```bash
cd src
npm run test:docker
git add -A
git commit -m "feat(agente): status_projeto aceita periodo e absorve o horas_por_projeto (§8.1)"
```

---

## Task 7: Extrair a validação de férias para `lib/vacationRequests.js`

A tool de escrita da Task 8 precisa validar exatamente como `POST /me/vacation-requests` valida. Copiar as regras criaria duas verdades que divergem na primeira mudança — o mesmo erro que a simulação de performance já cometeu. Esta task move a lógica sem mudar comportamento, e é pré-requisito da Task 8.

**Atenção: a rota de férias não tem teste de integração hoje.** `src/tests/integration/` não tem nenhum arquivo cobrindo `POST /me/vacation-requests` (o único teste que menciona férias é `agent/feriasEConflitos.test.js`, que é de outra tool). Mover código sem rede é como o defeito entra. Por isso o Step 1 escreve um **teste de caracterização** — que passa contra o código atual, antes de qualquer mudança — e o Step 4 roda o mesmo teste depois da extração. Se ele passar nas duas pontas, o comportamento não mudou.

**Files:**
- Create: `src/tests/integration/vacationRequests.test.js`
- Create: `src/lib/vacationRequests.js`
- Modify: `src/routes/vacations.js` (remove as funções locais, importa do lib)

**Interfaces:**
- Produces:
  - `ACTIVE_VACATION_STATUSES: string[]`
  - `parseVacationPayload(body) → { data: { start_date, end_date, days_count, reason } } | { error: string }`
  - `hasOverlappingVacation(userId, startDate, endDate) → Promise<boolean>`

- [ ] **Step 1: Escrever o teste de caracterização da rota (antes de mexer em nada)**

Crie `src/tests/integration/vacationRequests.test.js`:

```js
// Teste de caracterização: descreve o que POST /me/vacation-requests JÁ FAZ,
// para a extração das regras para lib/vacationRequests.js ser provadamente
// sem mudança de comportamento. Escrito antes da extração e rodado depois.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser } from '../helpers/factories.js'

function daquiA(dias) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

describe('POST /me/vacation-requests — regras de validação', () => {
  let emp, admin
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee', name: 'Ana' })
    admin = await makeUser({ role: 'admin', name: 'Chefe' })
  })

  it('cria como pending e conta os dias de forma inclusiva', async () => {
    const res = await asUser(emp).post('/me/vacation-requests')
      .send({ start_date: daquiA(10), end_date: daquiA(14) })
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('pending')
    expect(res.body.days_count).toBe(5)
  })

  it('auto-aprova quando quem pede é admin', async () => {
    const res = await asUser(admin).post('/me/vacation-requests')
      .send({ start_date: daquiA(10), end_date: daquiA(12) })
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('approved')
  })

  it('recusa data inválida, início no passado e fim antes do início', async () => {
    const invalida = await asUser(emp).post('/me/vacation-requests')
      .send({ start_date: '10/01/2030', end_date: daquiA(12) })
    expect(invalida.status).toBe(400)
    expect(invalida.body.error).toMatch(/início inválida/i)

    const passado = await asUser(emp).post('/me/vacation-requests')
      .send({ start_date: daquiA(-2), end_date: daquiA(12) })
    expect(passado.status).toBe(400)
    expect(passado.body.error).toMatch(/passado/i)

    const invertida = await asUser(emp).post('/me/vacation-requests')
      .send({ start_date: daquiA(14), end_date: daquiA(10) })
    expect(invertida.status).toBe(400)
    expect(invertida.body.error).toMatch(/posterior/i)
  })

  it('recusa período sobreposto a pedido pendente ou aprovado', async () => {
    await query(
      `INSERT INTO vacation_requests (user_id, start_date, end_date, days_count, status)
       VALUES ($1, $2, $3, 5, 'pending')`,
      [emp.id, daquiA(10), daquiA(14)],
    )
    const res = await asUser(emp).post('/me/vacation-requests')
      .send({ start_date: daquiA(12), end_date: daquiA(16) })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/já existe/i)
  })
})
```

- [ ] **Step 2: Rodar contra o código ATUAL e ver passar**

```bash
cd src
npm run test:docker -- tests/integration/vacationRequests.test.js
```

Esperado: PASS nos quatro casos, **sem tocar em código de produção**. Se algum falhar, o teste está descrevendo errado o comportamento atual — corrija o teste, não a rota. Commite esse teste sozinho antes de seguir:

```bash
git add src/tests/integration/vacationRequests.test.js
git commit -m "test: caracteriza as regras de POST /me/vacation-requests antes da extracao"
```

- [ ] **Step 3: Criar o módulo**

Crie `src/lib/vacationRequests.js` movendo o código de `routes/vacations.js` **sem alterar a lógica**:

```js
// Regras de uma solicitação de férias, fora da rota porque têm dois leitores: o
// POST /me/vacation-requests e a tool propor_pedir_ferias do agente. Duas cópias
// divergiriam na primeira mudança, e o agente passaria a propor o que a rota
// recusa (ou vice-versa).
import { query } from './db.js'

export const ACTIVE_VACATION_STATUSES = ['pending', 'approved']

function parseDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const utcTime = Date.UTC(year, month - 1, day)
  const date = new Date(utcTime)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return { value, utcTime }
}

function todayValue() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function calculateInclusiveDays(startUtcTime, endUtcTime) {
  return Math.round((endUtcTime - startUtcTime) / 86400000) + 1
}

export function parseVacationPayload(body) {
  const startDate = parseDateOnly(body.start_date)
  const endDate = parseDateOnly(body.end_date)
  const reason = body.reason?.trim() || null

  if (!startDate) return { error: 'Data de início inválida.' }
  if (!endDate) return { error: 'Data de fim inválida.' }
  if (endDate.utcTime < startDate.utcTime) {
    return { error: 'Data de fim deve ser igual ou posterior ao início.' }
  }
  if (startDate.value < todayValue()) {
    return { error: 'Solicitações de férias não podem começar no passado.' }
  }

  return {
    data: {
      start_date: startDate.value,
      end_date: endDate.value,
      days_count: calculateInclusiveDays(startDate.utcTime, endDate.utcTime),
      reason,
    },
  }
}

export async function hasOverlappingVacation(userId, startDate, endDate) {
  const { rows } = await query(
    `SELECT id FROM vacation_requests
      WHERE user_id = $1
        AND status = ANY($2)
        AND daterange(start_date::date, end_date::date, '[]') && daterange($3::date, $4::date, '[]')
      LIMIT 1`,
    [userId, ACTIVE_VACATION_STATUSES, startDate, endDate],
  )
  return rows.length > 0
}
```

- [ ] **Step 4: Ligar a rota ao módulo**

Em `src/routes/vacations.js`: apague `ACTIVE_VACATION_STATUSES`, `parseDateOnly`, `todayValue`, `calculateInclusiveDays`, `parseVacationPayload` e `hasOverlappingVacation`, e acrescente o import:

```js
import {
  ACTIVE_VACATION_STATUSES,
  parseVacationPayload,
  hasOverlappingVacation,
} from '../lib/vacationRequests.js'
```

Se `ACTIVE_VACATION_STATUSES` não for mais usado dentro do arquivo depois da remoção, tire-o do import — não deixe import morto.

- [ ] **Step 5: Rodar o MESMO teste de caracterização e ver passar de novo**

```bash
cd src
npm run test:docker -- tests/integration/vacationRequests.test.js
```

Esperado: PASS nos mesmos quatro casos, **sem uma linha de teste alterada**. Teste tocado aqui invalida a prova: se precisar mudar o teste para passar, o comportamento mudou e a extração está errada.

- [ ] **Step 6: Commit**

```bash
git add src/lib/vacationRequests.js src/routes/vacations.js
git commit -m "refactor: regras de solicitacao de ferias saem da rota para lib/vacationRequests"
```

---

## Task 8: Tool `propor_pedir_ferias`

**Files:**
- Create: `src/lib/agent/tools/write/proporPedirFerias.js`
- Create: `src/tests/integration/agent/pedirFerias.test.js`
- Modify: `src/lib/agent/tools/registry.js`, `src/routes/agent.js`, `src/lib/agent/context/dominio/core.md`, `src/lib/agent/evals/cases.js`, `src/tests/integration/agent/paridadePapel.test.js`

**Interfaces:**
- Consumes: `parseVacationPayload`, `hasOverlappingVacation` de `src/lib/vacationRequests.js` (Task 7); `query` de `src/lib/db.js`; `canAutoApproveOwnVacationRequest` de `src/lib/permissions.js`.
- Produces: default export `{ kind:'write', espelha:'POST /me/vacation-requests', roles:[os quatro papéis], definition, propose, execute }`. `propose` devolve `{ kind:'pedir_ferias', payload, descricao, dados }`; o `kind` é a chave nova do `WRITE_TOOLS`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/tests/integration/agent/pedirFerias.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/write/proporPedirFerias.js'

// Datas sempre no futuro: a rota espelhada recusa férias que começam no passado.
function daquiA(dias) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

describe('tool propor_pedir_ferias', () => {
  let emp, admin, inicio, fim
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee', name: 'Ana' })
    admin = await makeUser({ role: 'admin', name: 'Chefe' })
    inicio = daquiA(10)
    fim = daquiA(14)
  })

  it('propose descreve o pedido e conta os dias, sem gravar nada', async () => {
    const p = await tool.propose(emp, { inicio, fim, motivo: 'descanso' })
    expect(p.kind).toBe('pedir_ferias')
    expect(p.payload.start_date).toBe(inicio)
    expect(p.payload.days_count).toBe(5) // inclusivo nas duas pontas
    expect(p.descricao).toMatch(/5 dias/)
    const { rows } = await query('SELECT COUNT(*)::int AS n FROM vacation_requests WHERE user_id = $1', [emp.id])
    expect(rows[0].n).toBe(0)
  })

  it('propose recusa data no passado com a mesma mensagem da rota', async () => {
    await expect(tool.propose(emp, { inicio: daquiA(-3), fim })).rejects.toThrow(/passado/i)
  })

  it('propose recusa fim antes do início', async () => {
    await expect(tool.propose(emp, { inicio: fim, fim: inicio })).rejects.toThrow(/posterior/i)
  })

  it('propose recusa período que se sobrepõe a pedido existente', async () => {
    await query(
      `INSERT INTO vacation_requests (user_id, start_date, end_date, days_count, status)
       VALUES ($1, $2, $3, 5, 'pending')`,
      [emp.id, inicio, fim],
    )
    await expect(tool.propose(emp, { inicio, fim })).rejects.toThrow(/sobrep|já existe/i)
  })

  it('execute grava como pending para o colaborador', async () => {
    const { after } = await tool.execute(emp, { start_date: inicio, end_date: fim, days_count: 5, reason: null })
    expect(after.status).toBe('pending')
    expect(after.user_id).toBe(emp.id)
  })

  it('execute auto-aprova para o admin, igual à rota espelhada', async () => {
    const { after } = await tool.execute(admin, { start_date: inicio, end_date: fim, days_count: 5, reason: null })
    expect(after.status).toBe('approved')
  })

  it('execute revalida: sobreposição criada entre propor e aprovar → recusa', async () => {
    await query(
      `INSERT INTO vacation_requests (user_id, start_date, end_date, days_count, status)
       VALUES ($1, $2, $3, 5, 'approved')`,
      [emp.id, inicio, fim],
    )
    await expect(
      tool.execute(emp, { start_date: inicio, end_date: fim, days_count: 5, reason: null }),
    ).rejects.toThrow(/sobrep|já existe/i)
    const { rows } = await query('SELECT COUNT(*)::int AS n FROM vacation_requests WHERE user_id = $1', [emp.id])
    expect(rows[0].n).toBe(1) // só o que já existia
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd src
npm run test:docker -- tests/integration/agent/pedirFerias.test.js
```

Esperado: FALHA com módulo não encontrado.

- [ ] **Step 3: Escrever a tool**

Crie `src/lib/agent/tools/write/proporPedirFerias.js`:

```js
// Espelha POST /me/vacation-requests (vacations.js:176, requireAuth, todos os
// papéis): pede férias PARA SI. As regras de data e a checagem de sobreposição
// vêm de lib/vacationRequests.js — as mesmas que a rota usa, não uma cópia. O
// auto-aprovar do admin também é espelhado: quem tem o direito na rota tem aqui.
import { query } from '../../../db.js'
import { parseVacationPayload, hasOverlappingVacation } from '../../../vacationRequests.js'
import { canAutoApproveOwnVacationRequest } from '../../../permissions.js'

const definition = {
  type: 'function',
  function: {
    name: 'propor_pedir_ferias',
    description: 'Propõe uma solicitação de férias do próprio usuário. Requer confirmação. As datas são inclusivas e não podem começar no passado nem se sobrepor a um pedido pendente ou aprovado.',
    parameters: {
      type: 'object',
      properties: {
        inicio: { type: 'string', description: 'primeiro dia de férias, no formato YYYY-MM-DD' },
        fim: { type: 'string', description: 'último dia de férias (inclusivo), no formato YYYY-MM-DD' },
        motivo: { type: 'string', description: 'motivo, opcional' },
      },
      required: ['inicio', 'fim'],
      additionalProperties: false,
    },
  },
}

// A rota devolve {error} em vez de lançar; aqui o erro precisa virar Error para
// o loop.js entregar a mensagem ao modelo como erro de tool.
function validar(args) {
  const parsed = parseVacationPayload({
    start_date: args?.inicio,
    end_date: args?.fim,
    reason: args?.motivo,
  })
  if (parsed.error) throw new Error(parsed.error)
  return parsed.data
}

async function propose(profile, args) {
  const dados = validar(args)
  if (await hasOverlappingVacation(profile.id, dados.start_date, dados.end_date)) {
    throw new Error('Já existe uma solicitação de férias pendente ou aprovada nesse período.')
  }
  return {
    kind: 'pedir_ferias',
    payload: dados,
    descricao: `Pedir férias de ${dados.start_date} a ${dados.end_date} (${dados.days_count} dias).`,
    dados,
  }
}

async function execute(profile, payload) {
  // Revalida o ESTADO: outro pedido pode ter entrado entre propor e aprovar.
  if (await hasOverlappingVacation(profile.id, payload.start_date, payload.end_date)) {
    throw new Error('Já existe uma solicitação de férias pendente ou aprovada nesse período.')
  }
  const autoAprova = canAutoApproveOwnVacationRequest(profile)
  const decidedAt = autoAprova ? new Date().toISOString() : null

  const { rows } = await query(
    `INSERT INTO vacation_requests (user_id, start_date, end_date, days_count, reason, status, decided_by, decided_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, user_id, start_date, end_date, days_count, reason, status, decided_at, created_at`,
    [
      profile.id,
      payload.start_date,
      payload.end_date,
      payload.days_count,
      payload.reason ?? null,
      autoAprova ? 'approved' : 'pending',
      autoAprova ? profile.id : null,
      decidedAt,
      decidedAt || new Date().toISOString(),
    ],
  )
  return { before: null, after: rows[0] }
}

export default {
  kind: 'write',
  espelha: 'POST /me/vacation-requests',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, propose, execute,
}
```

- [ ] **Step 4: Registrar no registry e na rota**

Em `src/lib/agent/tools/registry.js`:

```js
import proporPedirFerias from './write/proporPedirFerias.js'
```

e inclua `proporPedirFerias` no array `TODAS`, junto das outras tools de escrita.

Em `src/routes/agent.js`, importe e registre o `kind`:

```js
import proporPedirFerias from '../lib/agent/tools/write/proporPedirFerias.js'
```

```js
const WRITE_TOOLS = {
  encerrar_apontamento: proporEncerrarApontamento,
  criar_apontamento: proporCriarApontamento,
  criar_task: proporCriarTask,
  pedir_ferias: proporPedirFerias,
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd src
npm run test:docker -- tests/integration/agent/pedirFerias.test.js
```

Esperado: PASS nos sete casos.

- [ ] **Step 6: Teste de ponta a ponta pela rota**

Acrescente ao `describe` de `src/tests/integration/agent/route.test.js`:

```js
  it('proposta pedir_ferias → evento proposal; execute grava a solicitação', async () => {
    const d = (dias) => {
      const x = new Date()
      x.setUTCDate(x.getUTCDate() + dias)
      return x.toISOString().slice(0, 10)
    }
    setClient(fakeClientOnce({
      role: 'assistant',
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'propor_pedir_ferias', arguments: JSON.stringify({ inicio: d(20), fim: d(24) }) } }],
    }))
    const chat = await asUser(emp).post('/agent/chat').send({ message: 'quero tirar férias' })
    const prop = (await readSse(chat)).find((e) => e.type === 'proposal')
    expect(prop.proposalId).toBeTruthy()

    const exec = await asUser(emp).post(`/agent/actions/${prop.proposalId}/execute`).send({})
    expect(exec.status).toBe(200)
    expect(exec.body.resultado.status).toBe('pending')
  })
```

- [ ] **Step 7: Domínio, eval e paridade**

Em `src/lib/agent/context/dominio/core.md`, no bloco `## O que você pode PROPOR`:

```markdown
- **pedir férias** para si, informando o primeiro e o último dia (inclusivos). Não pode
  começar no passado nem se sobrepor a um pedido pendente ou aprovado seu.
```

Em `src/lib/agent/evals/cases.js`:

```js
  { nome: 'pedir férias (colaborador)', papel: 'employee', pergunta: 'quero tirar férias do dia 10 ao dia 20 do mês que vem', espera: { toolEsperada: 'propor_pedir_ferias', exigirConfirmacao: true, naoAfirmarFeito: true } },
```

Em `src/tests/integration/agent/paridadePapel.test.js`, importe e adicione:

```js
import proporPedirFerias from '../../../lib/agent/tools/write/proporPedirFerias.js'
```

```js
  {
    tool: proporPedirFerias,
    chamar: (u) => [asUser(u).post('/me/vacation-requests').send({ start_date: '2030-01-10', end_date: '2030-01-12' })],
  },
```

- [ ] **Step 8: Suíte inteira + commit**

```bash
cd src
npm run test:docker
git add -A
git commit -m "feat(agente): tool propor_pedir_ferias (todos os papeis, com confirmacao)"
```

---

## Task 9: Fechar o design e o backlog

O design é o documento que a próxima pessoa lê. Ele hoje descreve tools que não existiam e um teste de paridade que existia pela metade; depois das tasks acima, precisa dizer o que ficou de fato.

**Files:**
- Modify: `docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md`

**Interfaces:**
- Consumes: o resultado das Tasks 1–8.
- Produces: nada em código.

- [ ] **Step 1: Atualizar o §8.1**

Marque `horas_por_projeto` como absorvido e registre as tools novas. Substitua as linhas correspondentes:

```markdown
- `despesas_do_periodo(periodo)` *(admin/aprovador)* — total de despesas aprovadas no
  período. **Global, nunca por projeto** — ver abaixo. **Implementada em 2026-08-09 (M6)**,
  espelhando `GET /admin/expense-requests`.
- ~~`horas_por_projeto(periodo)`~~ **absorvida pelo `status_projeto(projeto?, periodo?)`
  (2026-08-09, M6)**: com `periodo` a tool devolve as horas da janela, e sem nome de projeto
  vale para todos os ativos — que é exatamente a pergunta que a tool separada responderia.
  Uma tool a menos para o modelo escolher errado.
- `quem_nao_apontou(periodo)` / `apontamentos_abertos()` — a segunda **implementada em
  2026-08-09 (M6)**, espelhando `GET /admin/live`; devolve só quem está com o timer aberto,
  recorte para menos do que o endpoint (que lista todos e marca 'offline').
```

- [ ] **Step 2: Atualizar o §8.3**

```markdown
- `propor_criar_apontamento(...)`
- `propor_encerrar_apontamento(apontamento_id)`
- `propor_criar_task(...)`
- `propor_pedir_ferias(inicio, fim, motivo?)` *(2026-08-09, M6)* — espelha
  `POST /me/vacation-requests`, incluindo o auto-aprovar do admin. As regras de data e a
  checagem de sobreposição vivem em `lib/vacationRequests.js`, lidas pela rota e pela tool.
```

- [ ] **Step 3: Atualizar o §18 com a leitura de paridade que sobreviveu ao contato com o código**

Acrescente ao bloco do teste de paridade:

```markdown
  **Como ficou (2026-08-09, M6).** A paridade virou **dois testes dirigidos por tabela**,
  não um por tool:

  1. `paridadePapel.test.js` — para cada tool com `espelha`, bate no endpoint com os quatro
     papéis e exige que `tool.roles` seja exatamente o conjunto de papéis que o endpoint não
     nega (401/403). Um caso extra falha se alguma tool do registry ficar fora da tabela.
  2. `paridadeColuna.test.js` — a comparação de `Object.keys()` **só funciona para tool
     pass-through** (`listar_equipe`); as demais renomeiam para português e agregam. O risco
     real do §18 é valor financeiro chegando a quem não pode ver, então o teste planta
     sentinelas no fixture (`hourly_rate = 777.77`, `cost_snapshot = 999999`,
     `sale_value = 424242`) e exige que não apareçam no JSON de nenhuma tool oferecida a
     papel não-admin. Um caso de controle confirma que o sentinela **aparece** para o admin,
     senão o teste passaria por vacuidade.
```

- [ ] **Step 4: Anotar a fatia nova no §5**

Acrescente ao final do §5:

```markdown
**Terceira fatia (2026-08-09, M6).** `dominio/administrative_intern.md`. O `prompt.js`
tratava o estagiário como colaborador, e a fatia do colaborador afirma que não há
informação financeira — o que passou a ser mentira quando `despesas_do_periodo` entrou
(ele é aprovador e vê valor de despesa). São três mundos: admin, estagiário
administrativo e todo o resto.
```

- [ ] **Step 5: Rodar a suíte inteira uma última vez**

```bash
cd src
npm run test:docker
npm run check
```

Esperado: tudo verde, `check` sem saída.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md
git commit -m "docs(agente): design registra as tools do M6, a paridade executavel e a fatia do estagiario"
```

---

## O que este plano NÃO faz

Registrado para ninguém achar que foi esquecido:

- **Não roda os evals contra o modelo real.** `npm run test:evals` precisa de `AGENT_API_KEY` e rede, e não entra no CI por decisão do §13. Os casos novos ficam prontos para a próxima rodada manual.
- **Não aplica a migration `031_agent_readonly_grants.sql`** em nenhum banco de produção, nem cria o secret `AGENT_READONLY_DATABASE_URL` ou roda o `ALTER ROLE agent_readonly PASSWORD ...`. Isso é operação de deploy (§16), fora do alcance de quem executa este plano.
- **Não revisa M1 e M2.** O núcleo (loop, rota, sessão, propostas, scope, auditoria) e as cinco tools do M2 nunca passaram por revisão dedicada — a única revisão até aqui cobriu M3–M5. Fica como trabalho separado.
- **Não mexe no widget do front.** `web/src/components/AgentWidget.jsx` continua como está; as tools novas aparecem sozinhas, porque o widget não conhece o catálogo.
