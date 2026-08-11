# Agente — Correções pós-análise (M7) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Data:** 2026-08-11
**Origem:** análise do agente implementado (conversa de 2026-08-11), itens 1–8 e 10.
**Escopo escolhido pelo usuário:** só as correções. O backlog da Fase 1 (feature flag /
rollout por papel, lint do `dominio/`, recorte linha a linha de `expenses`, política de
retenção/LGPD) **fica fora** e segue registrado no §20 do design.

**Goal:** deixar o agente pronto para produção — configuração explícita, custo observável
de verdade, e os cinco defeitos de comportamento que a análise encontrou corrigidos com
teste.

> **Estado da execução (2026-08-11).** Tasks 1–9 feitas e revisadas, um commit cada. Os
> checkboxes abaixo ficaram sem marcar durante a execução; a fonte de verdade é o log de
> commits da branch `fix/agente-correcoes-pos-analise`.
>
> **Task 10 (rodada de eval) não fechou.** Rodou duas vezes contra a NVIDIA NIM e o
> endpoint devolveu saída incoerente — HTML de página 404 como resposta, `</think>` cru no
> texto, troca de idioma, loop de repetição. Placar de 13/21 nas duas, mas medindo a saúde
> do endpoint, não a qualidade do modelo. Registrar aquilo como "o Flash tirou 13/21" seria
> ruído com número. Refazer depois da migração para a API oficial da DeepSeek.
>
> A revisão da Task 10 rendeu quatro correções que não estavam no plano e foram feitas:
> checadores de eval que reprovavam comportamento correto, runner de turno único que punia
> raciocínio multi-passo, temperatura herdada do provedor, e a recusa que descrevia o
> mecanismo interno.
>
> **Task 11 (role read-only e secrets) segue aberta** — exige credencial do Fly. Migrou
> para a lista de pendências no README. **Task 12** foi feita como revisão desta conversa.

**Architecture:** nada de estrutura nova. Todas as mudanças são cirúrgicas em módulos que
já existem: `routes/agent.js`, `lib/agent/{proposals,guards,loop,audit}.js`,
`web/src/{lib/agentClient.js,lib/agentSession.js,pages/AssistentePage.jsx,contexts/AuthContext.jsx}`,
mais `src/.env.example` e os specs. O único endpoint novo é o `POST
/agent/actions/:proposalId/cancel`, simétrico ao `execute` que já existe.

**Tech Stack:** Node 20 + Express 5 (ESM puro), Postgres via `pg`, Vitest + supertest no
backend, Vitest puro no front (React 19 / Vite), cliente `openai` v7 apontado para NVIDIA
NIM.

## Global Constraints

- **Modelo e provedor decididos (2026-08-11):** `deepseek-ai/deepseek-v4-flash-0731` em
  `https://integrate.api.nvidia.com/v1`. O código já é isso; os specs é que serão
  atualizados. **Não** reintroduzir OpenRouter nem o DeepSeek V4 Pro.
- **ESM puro.** Nada de `require`. Imports relativos sempre com extensão `.js`.
- **Comentários e mensagens de usuário em português.** Comentário explica *por quê*, não
  *o quê* — é o padrão do repositório inteiro.
- **TDD sem exceção.** Teste que falha primeiro, implementação mínima depois. Cada task
  termina verde e com commit próprio.
- **Backend:** rodar de `src/`. `npm run test:unit` para o ciclo rápido, `npm run
  test:docker` para a suíte inteira (sobe Postgres em Docker), `npm run check` para o
  syntax check.
- **Front:** rodar de `web/`. `npm test`. Não há `@testing-library/react` no projeto —
  **não adicione**; componente React se verifica manualmente, lógica pura se extrai para
  `web/src/lib/` e se testa lá.
- **Nada de tabela nova, nada de dependência nova.**
- Mensagem de commit no padrão do repo: `fix(agente): ...` / `feat(agente): ...` /
  `docs(agente): ...`, em português, sem escapar acento.

---

## File Structure

**Modificados — backend**

| Arquivo | Responsabilidade nesta mudança |
|---|---|
| `src/.env.example` | Passa a documentar as 20 variáveis `AGENT_*` (18 que o código já lê + 2 criadas neste plano). Hoje não documenta nenhuma. |
| `src/vitest.config.js` | Injeta `AGENT_API_KEY` no ambiente de teste (a guarda nova da Task 1 quebraria toda a suíte sem isto). |
| `src/routes/agent.js` | 503 legível sem chave; rate limit por usuário; endpoint `cancel`. |
| `src/lib/agent/proposals.js` | `takeProposal` passa a conferir o papel, não só o dono. |
| `src/lib/agent/guards.js` | Novo teto `maxToolResultChars`. |
| `src/lib/agent/loop.js` | Aplica o teto ao resultado de tool antes de entrar no histórico. |
| `src/lib/agent/audit.js` | `custo: null` quando não há preço configurado; novo `auditAgentCancel`. |

**Modificados — front**

| Arquivo | Responsabilidade nesta mudança |
|---|---|
| `web/src/lib/agentClient.js` | Nova `cancelProposal`. |
| `web/src/lib/agentSession.js` | Descarta o `File` na serialização (não sobrevive ao JSON). |
| `web/src/pages/AssistentePage.jsx` | Cancelar chama o servidor; retry reenvia o anexo. |
| `web/src/contexts/AuthContext.jsx` | Logout limpa a conversa do `localStorage`. |

**Criados — testes**

| Arquivo | Cobre |
|---|---|
| `src/tests/integration/agent/semChave.test.js` | Task 1 |
| `src/tests/integration/agent/rateLimit.test.js` | Task 4 |
| `src/tests/unit/agent/truncarResultado.test.js` | Task 5 |
| `src/tests/integration/agent/cancelar.test.js` | Task 6 |

**Modificados — testes**

`src/tests/unit/agent/proposals.test.js` (Task 3), `src/tests/unit/agent/audit.test.js`
(Task 2), `web/src/lib/agentSession.test.js` (Task 7).

**Modificados — documentação**

`docs/superpowers/specs/2026-08-07-agente-gestao-visao-geral.md`,
`docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md`, `README.md`, e
`docs/superpowers/evals/2026-08-11-rodada-flash.md` (criado na Task 10).

---

## Task 0: Ponto de partida verde

Nada aqui é opcional. Se a suíte já estiver vermelha antes de você começar, toda falha
adiante fica ambígua.

**Files:** nenhum.

**Interfaces:**
- Consumes: nada.
- Produces: a certeza de que o vermelho que aparecer depois é seu.

- [ ] **Step 1: Confirmar que o tree está limpo**

```bash
git status --short
```

Esperado: nenhuma saída. Se houver algo, pare e resolva com o dono do repo antes de seguir.

- [ ] **Step 2: Rodar a suíte inteira com o Postgres de teste**

```bash
cd src
npm run test:docker
```

Esperado: tudo verde. Hoje são 28 arquivos de unit (176 testes) mais os de integração.
Se o Docker não subir, pare — as Tasks 1, 4 e 6 têm testes de integração e você não
conseguirá validá-las.

- [ ] **Step 3: Rodar a suíte do front**

```bash
cd web
npm test
```

Esperado: verde (`agentClient`, `agentSession`, `nav`, `periods`).

- [ ] **Step 4: Confirmar que o app sobe em Node puro**

```bash
cd src
npm run check
```

Esperado: nenhuma saída.

---

## Task 1: Configuração explícita — `.env.example` e 503 legível sem chave

Hoje **nenhuma** variável `AGENT_*` está em `src/.env.example`. Sem `AGENT_API_KEY` o
cliente ainda assim é construído, com a chave-placeholder `'sk-agente-sem-chave'`
(`src/lib/agent/client.js:81`), e a falha só aparece na primeira chamada real — como um
erro de provedor no meio do stream, ilegível para quem está operando. Esta task fecha os
dois lados: documenta tudo e faz a rota recusar cedo, com log alto para o operador e
mensagem genérica para o usuário.

**Decisão registrada:** o default de `AGENT_ENABLED` **continua `true`**. Ele é kill
switch (desligar sem deploy), não feature flag; o rollout por papel ficou fora do escopo.
O que resolve o risco de "subiu ligado e sem chave" é a guarda de chave desta task.

**Files:**
- Modify: `src/.env.example`
- Modify: `src/vitest.config.js:16-17`
- Modify: `src/routes/agent.js:1-19` (imports), `:30-34` (guardas), `:67-68` e `:158-159`
- Modify: `README.md`
- Test: `src/tests/integration/agent/semChave.test.js` (criar)

**Interfaces:**
- Consumes: `logger` de `src/lib/logger.js`; `agenteDesligado()` que já existe.
- Produces: `agenteSemChave(): boolean` em `src/routes/agent.js` (privada ao módulo) e a
  garantia, para as tasks seguintes, de que `AGENT_API_KEY` está setada no ambiente de
  teste.

- [ ] **Step 1: Injetar `AGENT_API_KEY` no ambiente de teste — antes de tudo**

Sem isto, a guarda do Step 4 derruba **todos** os testes de integração do agente que já
existem (`route.test.js`, `criarApontamento.test.js`, e outros 20), porque a config de
teste hoje só injeta `DATABASE_URL`, `JWT_SECRET` e `NODE_ENV`.

Em `src/vitest.config.js`, logo depois da linha do `JWT_SECRET`:

```js
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret'
// O agente recusa requisição sem AGENT_API_KEY (routes/agent.js). Os testes usam
// cliente falso e nunca chamam provedor de verdade, mas precisam passar da guarda.
const AGENT_API_KEY = process.env.AGENT_API_KEY || 'test-agent-key'
```

E no bloco `env` do `defineConfig`:

```js
    env: { DATABASE_URL, JWT_SECRET, AGENT_API_KEY, NODE_ENV: 'test' },
```

- [ ] **Step 2: Escrever o teste que falha**

Criar `src/tests/integration/agent/semChave.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resetDb } from '../../helpers/db.js'
import { asUser } from '../../helpers/api.js'
import { makeUser } from '../../helpers/factories.js'

// Sem AGENT_API_KEY o cliente é construído com uma chave-placeholder e a falha só
// aparece como erro de provedor no meio do stream. A rota tem que recusar antes.
describe('agente sem AGENT_API_KEY configurada', () => {
  let emp
  const original = process.env.AGENT_API_KEY
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee' })
  })
  afterEach(() => {
    if (original === undefined) delete process.env.AGENT_API_KEY
    else process.env.AGENT_API_KEY = original
  })

  it('/agent/chat responde 503 com mensagem genérica', async () => {
    delete process.env.AGENT_API_KEY
    const res = await asUser(emp).post('/agent/chat').send({ message: 'oi' })
    expect(res.status).toBe(503)
    expect(res.body.error).toBe('Assistente indisponível no momento.')
    // Não vaza o nome da variável para o usuário final.
    expect(res.body.error).not.toMatch(/AGENT_API_KEY/)
  })

  it('/agent/actions/:id/execute também responde 503', async () => {
    delete process.env.AGENT_API_KEY
    const res = await asUser(emp).post('/agent/actions/qualquer-id/execute').send({})
    expect(res.status).toBe(503)
  })

  it('com a chave presente a rota segue normal (400 por falta de message, não 503)', async () => {
    process.env.AGENT_API_KEY = 'chave-de-teste'
    const res = await asUser(emp).post('/agent/chat').send({})
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd src
npx vitest run tests/integration/agent/semChave.test.js
```

Esperado: FAIL nos dois primeiros casos — a rota responde 400/200 em vez de 503.

- [ ] **Step 4: Implementar a guarda**

Em `src/routes/agent.js`, adicionar o import do logger junto dos outros:

```js
import { logger } from '../lib/logger.js'
```

E logo abaixo de `agenteDesligado()`:

```js
// Sem chave o cliente ainda é construído (o SDK v7 exige apiKey no construtor,
// client.js:81 usa um placeholder), e a falha só apareceria como erro de provedor
// no meio do stream. Recusa antes: log alto para quem opera, mensagem genérica
// para quem perguntou — o nome da variável não é assunto do usuário final.
function agenteSemChave() {
  return !process.env.AGENT_API_KEY
}
function recusarSemChave(res) {
  logger.error({ evt: 'agent_misconfig', faltando: 'AGENT_API_KEY' }, 'agente respondendo 503: chave ausente')
  return res.status(503).json({ error: 'Assistente indisponível no momento.' })
}
```

Em `/agent/chat`, logo abaixo da linha do kill switch:

```js
  if (agenteDesligado()) return res.status(503).json({ error: 'Assistente temporariamente desativado.' })
  if (agenteSemChave()) return recusarSemChave(res)
```

E o mesmo par de linhas no `/agent/actions/:proposalId/execute`.

- [ ] **Step 5: Rodar e ver passar**

```bash
cd src
npx vitest run tests/integration/agent/semChave.test.js
```

Esperado: 3 passando.

- [ ] **Step 6: Rodar a suíte inteira — este é o passo que pega a regressão**

```bash
cd src
npm run test:docker
```

Esperado: tudo verde. Se algum teste de agente der 503, o Step 1 não foi aplicado.

- [ ] **Step 7: Documentar as variáveis no `.env.example`**

Acrescentar ao fim de `src/.env.example`:

```bash
# ─── Agente (assistente conversacional) ─────────────────────────────────────
# Kill switch. Ausente ou 'true' = ligado; qualquer outro valor derruba /agent/*
# com 503, sem precisar de deploy.
AGENT_ENABLED=true

# Provedor OpenAI-compatible + modelo. Decidido em 2026-08-11: DeepSeek V4 Flash
# hospedado na NVIDIA NIM. Sem AGENT_API_KEY a rota responde 503.
AGENT_PROVIDER_BASE_URL=https://integrate.api.nvidia.com/v1
AGENT_MODEL=deepseek-ai/deepseek-v4-flash-0731
AGENT_API_KEY=

# Preço do modelo em USD por 1M de tokens — alimenta o campo `custo` da linha de
# log agent_usage, que é a base dos alertas de gasto no Axiom. Sem estes valores
# o custo sai `null` (e não zero, que mentiria). Números de referência da tabela
# do DeepSeek V4 Flash; reconcilie com a fatura real da NVIDIA.
AGENT_PRICE_IN=0.14
AGENT_PRICE_OUT=0.28
AGENT_PRICE_CACHED=0.14

# SQL ad-hoc (tool consultar_dados, admin-only): role somente-leitura dedicada,
# criada pelas migrations 030/031. Sem isto a tool falha só para o admin.
AGENT_READONLY_DATABASE_URL=

# Guardas por requisição — os valores abaixo são os defaults do código.
AGENT_MAX_ITERATIONS=6
AGENT_MAX_TOKENS=1024
AGENT_TIMEOUT_MS=30000
AGENT_MAX_CONCURRENT_PER_USER=1
# Teto por janela de 15 min, por usuário (criado na Task 4 deste plano).
AGENT_CHAT_RATE_MAX=40
# Corte do resultado de tool antes de entrar no histórico (Task 5 deste plano).
AGENT_MAX_TOOL_RESULT_CHARS=20000

# Retry da chamada ao modelo. AGENT_MAX_RETRIES=0 desliga o retry (o código
# respeita o 0 explícito, não cai no default — ver envInt em client.js:14).
AGENT_MAX_RETRIES=2
AGENT_RETRY_BACKOFF_MS=250
AGENT_ATTEMPT_TIMEOUT_MS=30000

# Pool da conexão somente-leitura do SQL ad-hoc.
AGENT_SQL_MAX_ROWS=200
AGENT_SQL_TIMEOUT_MS=3000
AGENT_SQL_POOL_MAX=4
```

São **20** no total: 18 que o código já lê hoje, mais `AGENT_CHAT_RATE_MAX` e
`AGENT_MAX_TOOL_RESULT_CHARS`, criadas nas Tasks 4 e 5. Se você acrescentar uma variável
`AGENT_*` nova depois, a regra é: documentar aqui no mesmo commit — foi a ausência desse
hábito que deixou todas as 18 sem registro.

`AGENT_MAX_TOOL_RESULT_CHARS` e `AGENT_CHAT_RATE_MAX` só passam a existir nas Tasks 5 e 4.
Documentar agora é de propósito: o bloco de env fica completo num commit só, e as duas
tasks seguintes leem o default daqui.

- [ ] **Step 8: Documentar no README**

O README não menciona o agente em lugar nenhum. Acrescentar uma seção, antes da seção de
observabilidade:

```markdown
## Agente (assistente)

Assistente conversacional em `/assistente`, disponível para todos os papéis — cada pessoa
alcança por ele exatamente o que alcançaria navegando o site. Backend em
`src/lib/agent/`, rotas em `src/routes/agent.js`.

Variáveis de ambiente: ver o bloco `AGENT_*` em `src/.env.example`. As três obrigatórias
são `AGENT_API_KEY`, `AGENT_MODEL` e `AGENT_PROVIDER_BASE_URL`; sem a chave, `/agent/*`
responde 503 e registra `evt: agent_misconfig`.

- **Desligar sem deploy:** `AGENT_ENABLED=false`.
- **SQL ad-hoc (admin):** exige `AGENT_READONLY_DATABASE_URL` apontando para a role
  `agent_readonly` (migrations 030 e 031). Sem isso, só a tool `consultar_dados` falha.
- **Custo:** cada chamada emite `evt: agent_usage` com `tokens_in`, `tokens_out`,
  `tokens_cached` e `custo` em USD. `custo` é `null` quando os `AGENT_PRICE_*` não estão
  configurados.
- **Evals:** `npm run test:evals` roda os casos contra o modelo real (precisa de chave e
  rede). Não entra no CI.
```

- [ ] **Step 9: Commit**

```bash
git add src/.env.example src/vitest.config.js src/routes/agent.js README.md src/tests/integration/agent/semChave.test.js
git commit -m "fix(agente): recusa legivel sem AGENT_API_KEY e documenta as variaveis de ambiente"
```

---

## Task 2: Custo real no log — `custo: null` sem preço, e specs alinhados ao Flash/NIM

`logUsage` usa `Number(process.env.AGENT_PRICE_IN) || 0` (`src/lib/agent/audit.js:19-21`).
Sem os preços configurados, `custo` sai **`0`** em toda linha — indistinguível de "não
custou nada". Um alerta no Axiom sobre a média de `custo` fica em zero para sempre e
ninguém percebe. `null` é a resposta honesta: "não sei", e o Axiom ignora nulo em
agregação em vez de puxar a média para baixo.

Na mesma task, os specs param de mentir sobre o modelo.

**Files:**
- Modify: `src/lib/agent/audit.js:18-29`
- Modify: `src/tests/unit/agent/audit.test.js`
- Modify: `docs/superpowers/specs/2026-08-07-agente-gestao-visao-geral.md`
- Modify: `docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md`

**Interfaces:**
- Consumes: `logger`, `testSink`/`clearTestSink` de `src/lib/logger.js`.
- Produces: `logUsage` com a mesma assinatura; só o valor de `custo` muda (`number | null`).

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar em `src/tests/unit/agent/audit.test.js`, dentro do `describe('audit')`:

```js
  it('custo é null quando os preços não estão configurados (zero mentiria)', () => {
    delete process.env.AGENT_PRICE_IN
    delete process.env.AGENT_PRICE_OUT
    delete process.env.AGENT_PRICE_CACHED
    logUsage({ profile: { id: 3 }, model: 'x', tokensIn: 1_000_000, tokensOut: 500_000 })
    const log = find('agent_usage')
    expect(log.tokens_in).toBe(1_000_000)
    expect(log.custo).toBeNull()
  })

  it('preço parcial já basta para calcular (o que falta conta como zero)', () => {
    delete process.env.AGENT_PRICE_OUT
    delete process.env.AGENT_PRICE_CACHED
    process.env.AGENT_PRICE_IN = '0.14'
    logUsage({ profile: { id: 3 }, model: 'x', tokensIn: 1_000_000, tokensOut: 1_000_000 })
    const log = find('agent_usage')
    expect(log.custo).toBeCloseTo(0.14, 5)
  })
```

O teste que já existe (`'logUsage calcula custo a partir dos preços de env'`) seta as três
variáveis e nunca as restaura, vazando para os testes seguintes. Corrija de passagem —
troque o corpo dele para restaurar no fim:

```js
  it('logUsage calcula custo a partir dos preços de env', () => {
    const antes = { ...process.env }
    process.env.AGENT_PRICE_IN = '0.14'    // DeepSeek V4 Flash, USD / 1M tokens
    process.env.AGENT_PRICE_OUT = '0.28'
    process.env.AGENT_PRICE_CACHED = '0.14'
    logUsage({ profile: { id: 3 }, model: 'x', tokensIn: 1_000_000, tokensOut: 0, cached: 0 })
    const log = find('agent_usage')
    expect(log.tokens_in).toBe(1_000_000)
    expect(log.custo).toBeCloseTo(0.14, 5)
    process.env = antes
  })
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd src
npx vitest run tests/unit/agent/audit.test.js
```

Esperado: FAIL em `expect(log.custo).toBeNull()` — recebe `0`.

- [ ] **Step 3: Implementar**

Substituir o corpo de `logUsage` em `src/lib/agent/audit.js`:

```js
// Custo = tokens não-cacheados a preço cheio + cacheados a preço de cache.
// Preços em USD por 1M de tokens, configurados junto com o modelo.
// SEM NENHUM preço configurado o custo é `null`, não `0`: zero é um valor de
// verdade e faria toda média no Axiom mentir para baixo, escondendo justamente
// o gasto que o §19.1 quer observar. Com pelo menos um preço, calcula.
// status: 'ok' no caminho feliz; 'timeout'/'error' quando a chamada falha — o
// evento sai mesmo assim para o custo/tentativa aparecer no log (§18/§19.1).
export function logUsage({ profile, model, tokensIn = 0, tokensOut = 0, cached = 0, status = 'ok', erro }) {
  const precos = ['AGENT_PRICE_IN', 'AGENT_PRICE_OUT', 'AGENT_PRICE_CACHED']
    .map((n) => Number(process.env[n]))
    .map((v) => (Number.isFinite(v) ? v : 0))
  const configurado = precos.some((p) => p > 0)
  const [priceIn, priceOut, priceCached] = precos
  const naoCacheado = Math.max(0, tokensIn - cached)
  const custo = configurado
    ? (naoCacheado * priceIn + cached * priceCached + tokensOut * priceOut) / 1_000_000
    : null
  logger.info({
    evt: 'agent_usage', user_id: profile?.id, model,
    tokens_in: tokensIn, tokens_out: tokensOut, tokens_cached: cached, custo,
    status, ...(erro ? { erro } : {}),
  })
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd src
npx vitest run tests/unit/agent/audit.test.js
```

Esperado: 4 passando.

- [ ] **Step 5: Medir se a NIM reporta cache**

O código conta `usage.prompt_tokens_details.cached_tokens` (`loop.js:43`). A NVIDIA NIM
pode não reportar esse campo — e se não reportar, `tokens_cached` é sempre 0 e
`AGENT_PRICE_CACHED` é decorativo. Descubra antes de escrever o número no spec:

```bash
cd src
node -e "
import('dotenv/config').then(async () => {
  const { getClient } = await import('./lib/agent/client.js')
  const r = await getClient().stream({ messages: [{ role: 'user', content: 'oi' }], tools: [], model: process.env.AGENT_MODEL }, () => {})
  console.log(JSON.stringify(r.usage, null, 2))
})
"
```

Anote se aparece `prompt_tokens_details`. Se **não** aparecer, mantenha
`AGENT_PRICE_CACHED` igual a `AGENT_PRICE_IN` (inofensivo, já que `cached` é sempre 0) e
registre a observação no Step 6. Se aparecer, ajuste o valor para o preço de cache do
provedor.

- [ ] **Step 6: Atualizar a visão geral**

Em `docs/superpowers/specs/2026-08-07-agente-gestao-visao-geral.md`, na tabela do §2,
substituir a linha do modelo:

```markdown
| **Modelo** | **DeepSeek V4 Flash (`deepseek-ai/deepseek-v4-flash-0731`) na NVIDIA NIM** *(2026-08-11; era DeepSeek V4 Pro via OpenRouter)* | Modelo único, sem roteamento. A arquitetura continua agnóstica (cliente OpenAI-compatible, base URL por env), então a troca foi só de config. O A/B do §13 passa a ter o Flash como titular e mede se ele basta — ver a rodada em `docs/superpowers/evals/` |
```

E acrescentar ao fim do §5, depois do parágrafo "Decisão (2026-08-08)":

```markdown
**Correção de 2026-08-11.** O que foi de fato implantado é o **DeepSeek V4 Flash
(`deepseek-ai/deepseek-v4-flash-0731`) hospedado na NVIDIA NIM**, não o Pro via
OpenRouter — o código carregava esse default desde o M1 e o spec não acompanhou. A
decisão fica confirmada como está: o §5 já dizia que o Flash sai por R$ 27/mês contra R$
82 do Pro, e o argumento a favor do Pro era qualidade não medida. A medição é a rodada de
eval da Task 10 deste plano; se o Flash reprovar, a troca é uma variável de ambiente.
```

- [ ] **Step 7: Atualizar o design**

Em `docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md`, acrescentar ao §19.1:

```markdown
**Correção de 2026-08-11 — `custo` é `null`, não `0`.** Os `AGENT_PRICE_*` nunca foram
configurados em lugar nenhum, e `logUsage` caía em `|| 0`: toda linha `agent_usage` saía
com `custo: 0`, indistinguível de "não custou". Um alerta sobre a média teria ficado em
zero para sempre. Agora, sem nenhum preço configurado, o campo sai `null` — o Axiom
ignora nulo em agregação, e a ausência aparece como ausência. Os preços entraram no
`.env.example` junto com as outras dezessete variáveis `AGENT_*` que o código lê e que
também não estavam documentadas em lugar nenhum.
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/agent/audit.js src/tests/unit/agent/audit.test.js docs/superpowers/specs/
git commit -m "fix(agente): custo vira null sem preco configurado e specs registram Flash na NIM"
```

---

## Task 3: `takeProposal` confere o papel, não só o dono

`src/lib/agent/proposals.js:34-40` guarda `role` na proposta e nunca compara. `loadSession`
e `saveTurn` comparam (`session.js:37` e `:48`) — a assimetria é o problema. Hoje é
inofensivo, porque as quatro tools de escrita valem para os quatro papéis e cada `execute`
rederiva a permissão do profile vivo (o `requireAuth` relê do banco a cada request). Vira
buraco de verdade na primeira tool de escrita restrita a papel. Custa uma linha.

**Files:**
- Modify: `src/lib/agent/proposals.js:34-41`
- Test: `src/tests/unit/agent/proposals.test.js`

**Interfaces:**
- Consumes: nada novo.
- Produces: `takeProposal(id, profile, now?)` devolve `null` também quando
  `profile.role` difere do papel de quem criou a proposta.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar em `src/tests/unit/agent/proposals.test.js`:

```js
  it('não entrega a proposta se o papel mudou entre propor e aprovar', () => {
    // O requireAuth relê o profile do banco a cada request, então uma troca de
    // papel no meio do caminho chega aqui. A proposta é do par (dono, papel):
    // quem propôs como admin não executa como employee.
    const { proposalId } = createProposal({
      profile: { id: 1, role: 'admin' },
      kind: 'criar_task',
      payload: { title: 'x' },
    })
    expect(takeProposal(proposalId, { id: 1, role: 'employee' })).toBeNull()
  })

  it('mesmo dono e mesmo papel continua entregando', () => {
    const { proposalId } = createProposal({
      profile: { id: 1, role: 'admin' },
      kind: 'criar_task',
      payload: { title: 'x' },
    })
    expect(takeProposal(proposalId, { id: 1, role: 'admin' })).toMatchObject({ kind: 'criar_task' })
  })
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd src
npx vitest run tests/unit/agent/proposals.test.js
```

Esperado: FAIL no primeiro caso — recebe o objeto da proposta em vez de `null`.

- [ ] **Step 3: Implementar**

Em `src/lib/agent/proposals.js`, trocar a checagem de dono:

```js
export function takeProposal(proposalId, profile, now = Date.now()) {
  const p = pending.get(proposalId)
  if (!p) return null
  pending.delete(proposalId) // uso único, mesmo se inválida
  // Dono E papel: o requireAuth relê o profile do banco a cada request, então um
  // rebaixamento entre propor e aprovar chega até aqui. Mesma regra que o
  // session.js já aplica ao histórico — a assimetria é que era o defeito.
  if (p.userId !== profile.id || p.role !== profile.role) return null
  if (now - p.criadoEm > PROPOSAL_TTL_MS) return null
  return { kind: p.kind, payload: p.payload, conversationId: p.conversationId, descricao: p.descricao }
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd src
npx vitest run tests/unit/agent/proposals.test.js
```

Esperado: tudo verde.

- [ ] **Step 5: Provar que o teste pega a regressão**

Reverta a linha para `if (p.userId !== profile.id) return null`, rode de novo, confirme o
FAIL, e recoloque a versão correta.

- [ ] **Step 6: Rodar a suíte inteira**

```bash
cd src
npm run test:docker
```

Esperado: verde. Atenção especial a `multiturnoAposProposta.test.js` e
`execucaoRealimentaSessao.test.js`, que exercitam propor→executar.

- [ ] **Step 7: Commit**

```bash
git add src/lib/agent/proposals.js src/tests/unit/agent/proposals.test.js
git commit -m "fix(agente): proposta so e consumida pelo mesmo dono E mesmo papel"
```

---

## Task 4: Rate limit por usuário em `/agent/chat`

O único freio hoje é o lock de concorrência de 1 por usuário
(`src/routes/agent.js:96-100`): impede duas conversas simultâneas, não impede mil
sequenciais. O §19.1 decidiu "medir, não travar" para **gasto acumulado**, justificando
que "os guards por requisição já impedem runaway" — mas esses guards (iterações, timeout,
teto de tokens) são por requisição. Um laço no cliente passa por todos eles, um de cada
vez, para sempre. O `rateLimit()` do próprio repo já resolve isso e já é usado em
`auth.js:19` e `calendar.js:12`.

Chave por **usuário**, não por IP: o time inteiro pode sair pelo mesmo NAT do escritório.

**Files:**
- Modify: `src/routes/agent.js:1-19` (import), `:36-41` (config), `:67` (cadeia da rota)
- Test: `src/tests/integration/agent/rateLimit.test.js` (criar)

**Interfaces:**
- Consumes: `rateLimit`, `_resetRateLimitBuckets` de `src/lib/rateLimit.js`.
- Produces: middleware `chatRateLimit` na cadeia de `/agent/chat`, configurável por
  `AGENT_CHAT_RATE_MAX` (default 40 por 15 min, por usuário).

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/tests/integration/agent/rateLimit.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resetDb } from '../../helpers/db.js'
import { asUser } from '../../helpers/api.js'
import { makeUser } from '../../helpers/factories.js'
import { _resetRateLimitBuckets } from '../../../lib/rateLimit.js'
import { setClient, resetClient } from '../../../lib/agent/client.js'

function fakeClient() {
  return {
    async stream() {
      return { message: { role: 'assistant', content: 'ok' }, usage: { prompt_tokens: 1, completion_tokens: 1 } }
    },
  }
}

// O lock de concorrência barra o 2º chat SIMULTÂNEO; não barra o milésimo
// sequencial. Este é o freio por janela.
describe('rate limit do /agent/chat', () => {
  let a, b
  const original = process.env.AGENT_CHAT_RATE_MAX
  beforeEach(async () => {
    await resetDb()
    _resetRateLimitBuckets()
    process.env.AGENT_CHAT_RATE_MAX = '3'
    a = await makeUser({ role: 'employee' })
    b = await makeUser({ role: 'employee' })
    setClient(fakeClient())
  })
  afterEach(() => {
    resetClient()
    _resetRateLimitBuckets()
    if (original === undefined) delete process.env.AGENT_CHAT_RATE_MAX
    else process.env.AGENT_CHAT_RATE_MAX = original
  })

  it('passa até o teto e recusa a próxima com 429', async () => {
    for (let i = 0; i < 3; i++) {
      const ok = await asUser(a).post('/agent/chat').send({ message: `oi ${i}` })
      expect(ok.status).toBe(200)
    }
    const barrado = await asUser(a).post('/agent/chat').send({ message: 'mais uma' })
    expect(barrado.status).toBe(429)
    expect(barrado.headers['retry-after']).toBeDefined()
  })

  it('o teto é por usuário — o time todo sai pelo mesmo IP do escritório', async () => {
    for (let i = 0; i < 3; i++) await asUser(a).post('/agent/chat').send({ message: `oi ${i}` })
    const outro = await asUser(b).post('/agent/chat').send({ message: 'oi' })
    expect(outro.status).toBe(200)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd src
npx vitest run tests/integration/agent/rateLimit.test.js
```

Esperado: FAIL no primeiro caso — a quarta requisição devolve 200.

- [ ] **Step 3: Implementar**

Em `src/routes/agent.js`, acrescentar ao bloco de imports:

```js
import { rateLimit } from '../lib/rateLimit.js'
```

Logo abaixo de `limiteConcorrencia()`:

> **Cuidado:** não construa o middleware uma vez no topo do módulo
> (`const chatRateLimit = rateLimit({ max: Number(process.env...) })`). `rateLimit`
> desestrutura `max` no momento da construção, e o módulo é importado antes de o teste
> conseguir mexer no env — o teto ficaria congelado em 40 e o teste do Step 1 nunca
> passaria. Envolva, como abaixo:

```js
// Freio por JANELA, complementar ao lock de concorrência acima: aquele barra a 2ª
// conversa simultânea, este barra a milésima sequencial. Chave por usuário, não
// por IP — o escritório inteiro pode sair pelo mesmo NAT. Construído por
// requisição porque o teto vem de env e o teste precisa apertá-lo em runtime;
// os buckets vivem no módulo rateLimit.js, então nada se perde nisso.
function chatRateLimit(req, res, next) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.AGENT_CHAT_RATE_MAX) || 40,
    key: (r) => `agent-chat:${r.profile?.id ?? r.ip}`,
  })(req, res, next)
}
```

E na cadeia da rota — **depois** do `requireAuth` (a chave precisa de `req.profile`) e
**antes** do `uploadAnexo` (um 429 não deve consumir upload de 10 MB):

```js
router.post('/agent/chat', requireAuth, chatRateLimit, uploadAnexo, async (req, res) => {
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd src
npx vitest run tests/integration/agent/rateLimit.test.js
```

Esperado: 2 passando.

- [ ] **Step 5: Rodar a suíte inteira**

```bash
cd src
npm run test:docker
```

Esperado: verde. Os buckets são globais ao processo e os testes rodam serial
(`fileParallelism: false`), então o default de 40 não deve estourar — se algum arquivo de
teste do agente passar de 40 requisições do mesmo usuário, chame `_resetRateLimitBuckets()`
no `beforeEach` dele.

- [ ] **Step 6: Registrar no design**

Acrescentar ao §19.1 do design:

```markdown
**Complemento de 2026-08-11 — rate limit por janela.** "Medir, não travar" continua
valendo para o **gasto acumulado**. O que faltava era o freio por requisição no canal: o
lock de concorrência barra a 2ª conversa simultânea, mas não o milésimo pedido
sequencial, e os guards de iteração/timeout/token são todos por requisição. `/agent/chat`
passa a ter `rateLimit` de 40 por 15 min **por usuário** (`AGENT_CHAT_RATE_MAX`), com a
mesma máquina que auth e calendar já usam. O `execute` fica de fora: é barato e não chama
modelo.
```

- [ ] **Step 7: Commit**

```bash
git add src/routes/agent.js src/tests/integration/agent/rateLimit.test.js docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md
git commit -m "feat(agente): rate limit por usuario no /agent/chat"
```

---

## Task 5: Teto de tamanho no resultado de tool

`MAX_TURNS = 10` conta blocos de turno, nunca tamanho. Um resultado de `consultar_dados`
(até **200 linhas**, `SQL_LIMITS.maxRows`) entra inteiro em `session.messages`
(`loop.js:90`) e é **reenviado a cada turno seguinte**, por até dez turnos. O risco não é
tanto dinheiro no preço do Flash — é estourar a janela de contexto e tornar o custo por
pergunta imprevisível, que é exatamente o que o §19.1 quer observar.

O corte deixa o JSON sintaticamente inválido de propósito: o destinatário é um modelo de
linguagem, não um parser, e o marcador diz em português o que aconteceu e o que fazer.
Comentário no código para ninguém "consertar" isso depois.

**Files:**
- Modify: `src/lib/agent/loop.js:1-11` (helper), `:88-90` (uso)
- Test: `src/tests/unit/agent/truncarResultado.test.js` (criar)

**Interfaces:**
- Consumes: `process.env.AGENT_MAX_TOOL_RESULT_CHARS` (default 20000).
- Produces: `truncarResultado(json: string, limite?: number): string`, exportada de
  `src/lib/agent/loop.js`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/tests/unit/agent/truncarResultado.test.js`:

```js
import { describe, it, expect, afterEach } from 'vitest'
import { truncarResultado } from '../../../lib/agent/loop.js'

describe('truncarResultado', () => {
  const original = process.env.AGENT_MAX_TOOL_RESULT_CHARS
  afterEach(() => {
    if (original === undefined) delete process.env.AGENT_MAX_TOOL_RESULT_CHARS
    else process.env.AGENT_MAX_TOOL_RESULT_CHARS = original
  })

  it('deixa passar resultado dentro do teto, byte a byte', () => {
    const json = JSON.stringify([{ a: 1 }, { a: 2 }])
    expect(truncarResultado(json, 1000)).toBe(json)
  })

  it('corta o que passa do teto e explica o corte em português', () => {
    const json = JSON.stringify(Array.from({ length: 500 }, (_, i) => ({ nome: `pessoa ${i}` })))
    const cortado = truncarResultado(json, 200)
    expect(cortado.length).toBeLessThan(json.length)
    expect(cortado.startsWith(json.slice(0, 200))).toBe(true)
    expect(cortado).toContain('resultado cortado')
    // O modelo precisa saber o tamanho real para julgar se vale refinar a consulta.
    expect(cortado).toContain(String(json.length))
  })

  it('o teto vem de AGENT_MAX_TOOL_RESULT_CHARS quando não é passado', () => {
    process.env.AGENT_MAX_TOOL_RESULT_CHARS = '50'
    const json = JSON.stringify(Array.from({ length: 100 }, (_, i) => i))
    expect(truncarResultado(json)).toContain('resultado cortado')
  })

  it('teto ausente cai no default de 20000', () => {
    delete process.env.AGENT_MAX_TOOL_RESULT_CHARS
    const json = 'x'.repeat(19_999)
    expect(truncarResultado(json)).toBe(json)
    expect(truncarResultado('x'.repeat(20_001))).toContain('resultado cortado')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd src
npx vitest run tests/unit/agent/truncarResultado.test.js
```

Esperado: FAIL na importação — `truncarResultado` não existe.

- [ ] **Step 3: Implementar o helper**

Em `src/lib/agent/loop.js`, logo abaixo de `parseArgs`:

```js
// Teto de tamanho do resultado de tool que entra no histórico. MAX_TURNS conta
// BLOCOS, nunca tamanho: sem isto, 200 linhas de consultar_dados ficam na sessão
// e são reenviadas a cada turno por dez turnos — custo imprevisível e risco de
// estourar a janela de contexto.
//
// O corte deixa o JSON inválido DE PROPÓSITO. O destinatário é um modelo de
// linguagem, não um parser: o marcador em português diz o que sumiu e o que
// fazer a respeito. Não "conserte" isto fechando o JSON — fechar esconderia o
// corte e o modelo trataria a fatia como resposta completa.
export function truncarResultado(json, limite = Number(process.env.AGENT_MAX_TOOL_RESULT_CHARS) || 20_000) {
  if (json.length <= limite) return json
  return `${json.slice(0, limite)}\n[…resultado cortado: ${json.length} caracteres no total, ${limite} entregues. Diga isso a quem perguntou e ofereça refinar o período ou os filtros para ver o resto.]`
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd src
npx vitest run tests/unit/agent/truncarResultado.test.js
```

Esperado: 4 passando.

- [ ] **Step 5: Aplicar no laço**

Em `src/lib/agent/loop.js`, no ramo de tool de leitura, trocar o push:

```js
        try {
          const result = await tool.run(profile, args)
          auditAgentRead({ profile, tool: call.function.name, params: args, count: result.count })
          messages.push({ role: 'tool', tool_call_id: call.id, content: truncarResultado(JSON.stringify(result.data)) })
        } catch (err) {
```

Só o ramo de leitura. Erro de tool e resposta de proposta são curtos por construção.

- [ ] **Step 6: Escrever o teste de integração do laço**

Acrescentar em `src/tests/unit/agent/loop.test.js`. O arquivo já importa `runAgentTurn` e
já monta cliente falso — siga o padrão que estiver lá em vez de reimportar:

```js
  it('resultado gigante de tool entra cortado no histórico', async () => {
    process.env.AGENT_MAX_TOOL_RESULT_CHARS = '100'
    // Cliente falso: 1ª iteração chama listar_equipe, 2ª responde texto.
    let n = 0
    const client = {
      async stream() {
        n++
        if (n === 1) {
          return {
            message: {
              role: 'assistant',
              tool_calls: [{ id: 'c1', type: 'function', function: { name: 'listar_equipe', arguments: '{}' } }],
            },
            usage: {},
          }
        }
        return { message: { role: 'assistant', content: 'pronto' }, usage: {} }
      },
    }
    const messages = [{ role: 'user', content: 'quem está no time?' }]
    const { messages: full } = await runAgentTurn({
      client, profile: { id: 1, role: 'admin', name: 'A' }, model: 'x', messages, emit: () => {},
    })
    const resposta = full.find((m) => m.role === 'tool')
    expect(resposta.content.length).toBeLessThan(400)
    delete process.env.AGENT_MAX_TOOL_RESULT_CHARS
  })
```

Se `listar_equipe` precisar de banco no ambiente de unit, troque por uma tool que o
`loop.test.js` já esteja usando como falsa — o ponto do teste é o corte, não a tool.

- [ ] **Step 7: Rodar a suíte inteira**

```bash
cd src
npm run test:docker
```

Esperado: verde.

- [ ] **Step 8: Registrar no design**

Acrescentar ao §11 do design (o da sessão em memória):

```markdown
**Complemento de 2026-08-11 — teto de tamanho, não só de turnos.** `MAX_TURNS` conta
blocos e ignora tamanho: um resultado de `consultar_dados` com 200 linhas ficava inteiro
na sessão e voltava ao provedor a cada turno seguinte, por até dez turnos. Agora o laço
corta o resultado de tool de leitura em `AGENT_MAX_TOOL_RESULT_CHARS` (20k, ~5k tokens)
antes de empurrá-lo para o histórico, com um marcador que instrui o modelo a oferecer
refinar a consulta. O texto de anexo continua inteiro: 40k caracteres é o teto do
`extract.js` e persistir é o comportamento desejado (§Design de anexos, "anexa uma vez,
pergunta várias").
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/agent/loop.js src/tests/unit/agent/truncarResultado.test.js src/tests/unit/agent/loop.test.js docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md
git commit -m "fix(agente): teto de tamanho no resultado de tool que entra no historico"
```

---

## Task 6: Cancelar de verdade — endpoint + realimentação da sessão

`cancelar(idx)` (`web/src/pages/AssistentePage.jsx:249`) só marca estado no React. A
proposta fica no Map até o TTL de 5 min e — o que importa mais — o histórico do modelo
termina em `{status:'proposta_emitida'}`, sem nunca saber que foi recusada. Na pergunta
seguinte o modelo pode reoferecer, ou pior, presumir. É assimétrico com o
`appendExecutionNote` que já existe do lado da aprovação.

**Files:**
- Modify: `src/lib/agent/audit.js` (novo `auditAgentCancel`)
- Modify: `src/routes/agent.js` (novo endpoint, depois do `execute`)
- Modify: `web/src/lib/agentClient.js` (nova `cancelProposal`)
- Modify: `web/src/pages/AssistentePage.jsx:4` (import) e `:249-251` (`cancelar`)
- Test: `src/tests/integration/agent/cancelar.test.js` (criar)

**Interfaces:**
- Consumes: `takeProposal`, `appendExecutionNote` — ambos já importados em
  `src/routes/agent.js:7` e `:13`. **Depende da Task 1**, que cria `agenteSemChave()` e
  `recusarSemChave(res)` no mesmo módulo; se estiver executando fora de ordem, faça a
  Task 1 antes ou omita a linha do `agenteSemChave` aqui.
- Produces:
  - `auditAgentCancel({ profile, tool, params }): void` em `src/lib/agent/audit.js`.
  - `POST /agent/actions/:proposalId/cancel` → `200 {ok:true}` | `404` | `503`.
  - `cancelProposal(proposalId): Promise` em `web/src/lib/agentClient.js`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/tests/integration/agent/cancelar.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { asUser } from '../../helpers/api.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import { setClient, resetClient } from '../../../lib/agent/client.js'

function fakeToolCall(name, args = '{}') {
  let done = false
  return {
    async stream() {
      if (done) return { message: { role: 'assistant', content: 'ok' }, usage: {} }
      done = true
      return {
        message: { role: 'assistant', tool_calls: [{ id: 'c1', type: 'function', function: { name, arguments: args } }] },
        usage: {},
      }
    },
  }
}
const readSse = (res) => res.text.split('\n\n').filter(Boolean).map((f) => JSON.parse(f.replace(/^data: /, '')))

describe('POST /agent/actions/:id/cancel', () => {
  let emp, project
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee' })
    project = await makeProject({ name: 'Projeto Z' })
  })
  afterEach(() => resetClient())

  async function proporApontamento() {
    setClient(fakeToolCall('propor_criar_apontamento', JSON.stringify({ projeto: 'Projeto Z' })))
    const chat = await asUser(emp).post('/agent/chat').send({ message: 'começa meu timer no Projeto Z' })
    const eventos = readSse(chat)
    return {
      proposalId: eventos.find((e) => e.type === 'proposal').proposalId,
      conversationId: eventos.find((e) => e.type === 'session').conversation_id,
    }
  }

  it('consome a proposta: depois de cancelar, executar dá 404', async () => {
    const { proposalId } = await proporApontamento()
    const cancel = await asUser(emp).post(`/agent/actions/${proposalId}/cancel`).send({})
    expect(cancel.status).toBe(200)
    expect(cancel.body.ok).toBe(true)

    const exec = await asUser(emp).post(`/agent/actions/${proposalId}/execute`).send({})
    expect(exec.status).toBe(404)
  })

  it('não executa a escrita — nenhum apontamento é criado', async () => {
    const { proposalId } = await proporApontamento()
    await asUser(emp).post(`/agent/actions/${proposalId}/cancel`).send({})
    const { rows } = await query('SELECT 1 FROM time_entries WHERE user_id = $1', [emp.id])
    expect(rows).toHaveLength(0)
  })

  it('o próximo turno sabe que foi cancelado (nota volta ao histórico)', async () => {
    const { proposalId, conversationId } = await proporApontamento()
    await asUser(emp).post(`/agent/actions/${proposalId}/cancel`).send({})

    // Próximo turno: captura o que a rota manda ao modelo.
    let enviadas = null
    setClient({
      async stream({ messages }) {
        enviadas = messages
        return { message: { role: 'assistant', content: 'entendi' }, usage: {} }
      },
    })
    await asUser(emp).post('/agent/chat').send({ message: 'e aí?', conversation_id: conversationId })
    const texto = enviadas.map((m) => m.content).join(' ')
    expect(texto).toContain('Cancelado')
  })

  it('proposta inexistente dá 404', async () => {
    const res = await asUser(emp).post('/agent/actions/nao-existe/cancel').send({})
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd src
npx vitest run tests/integration/agent/cancelar.test.js
```

Esperado: FAIL — a rota não existe, tudo dá 404 (inclusive o primeiro caso, que espera 200).

- [ ] **Step 3: Implementar o evento de auditoria**

Acrescentar ao fim de `src/lib/agent/audit.js`:

```js
// Cancelamento NÃO é agent_action: nada foi escrito. Evento próprio para o Axiom
// conseguir separar "o agente propôs e a pessoa recusou" de "o agente escreveu" —
// a taxa de recusa é o sinal mais direto de proposta mal formulada.
export function auditAgentCancel({ profile, tool, params }) {
  logger.info({ evt: 'agent_cancel', user_id: profile?.id, role: profile?.role, tool, params })
}
```

- [ ] **Step 4: Implementar o endpoint**

Em `src/routes/agent.js`, trocar o import de audit para incluir o novo:

```js
import { auditAgentAction, auditAgentCancel } from '../lib/agent/audit.js'
```

E acrescentar o endpoint logo depois do `execute`, antes do `export default router`:

```js
// Simétrico ao execute: consome a proposta (some do Map na hora, não em 5 min) e
// realimenta a sessão dona com uma nota de recusa. Sem esta nota o histórico do
// modelo terminava em 'proposta_emitida' e ele não tinha como saber que a pessoa
// disse não — reoferecia, ou pior, presumia.
router.post('/agent/actions/:proposalId/cancel', requireAuth, async (req, res) => {
  if (agenteDesligado()) return res.status(503).json({ error: 'Assistente temporariamente desativado.' })
  if (agenteSemChave()) return recusarSemChave(res)

  const proposal = takeProposal(req.params.proposalId, req.profile)
  if (!proposal) return res.status(404).json({ error: 'Proposta não encontrada ou expirada.' })

  const nota = `✗ Cancelado pelo usuário: ${proposal.descricao || 'ação proposta'}`
  appendExecutionNote(proposal.conversationId, req.profile, nota)
  auditAgentCancel({ profile: req.profile, tool: proposal.kind, params: proposal.payload })
  return res.json({ ok: true })
})
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd src
npx vitest run tests/integration/agent/cancelar.test.js
```

Esperado: 4 passando.

- [ ] **Step 6: Ligar no front**

Em `web/src/lib/agentClient.js`, ao lado de `executeProposal`:

```js
export function cancelProposal(proposalId) {
  return api.post(`/agent/actions/${proposalId}/cancel`, {})
}
```

Em `web/src/pages/AssistentePage.jsx`, no import da linha 4:

```js
import { streamChat, executeProposal, cancelProposal } from '../lib/agentClient'
```

E substituir `cancelar`:

```js
  async function cancelar(idx) {
    const msg = mensagens[idx]
    if (!msg?.proposta || msg.executando) return
    // Marca na UI PRIMEIRO: cancelar não pode ficar preso esperando rede. Se a
    // chamada falhar, o TTL de 5 min derruba a proposta de qualquer forma — o
    // que se perde é só a nota no histórico do modelo.
    setMensagens((m) => m.map((x, i) => (i === idx ? { ...x, cancelado: true } : x)))
    try {
      await cancelProposal(msg.proposta.proposalId)
    } catch {
      /* proposta expira sozinha; não vale incomodar quem já cancelou */
    }
  }
```

- [ ] **Step 7: Verificar no navegador**

```bash
cd src && npm run dev     # terminal 1
cd web && npm run dev     # terminal 2
```

Em `/assistente`, peça "começa meu timer no <projeto>", clique **Cancelar**, e então
pergunte "e aí, iniciou?". Esperado: o card vira "Cancelado" na hora, e a resposta
seguinte reconhece que não foi iniciado. Na aba Network, o `POST .../cancel` responde 200.

- [ ] **Step 8: Rodar as duas suítes**

```bash
cd src && npm run test:docker
cd web && npm test
```

Esperado: verde nas duas.

- [ ] **Step 9: Commit**

```bash
git add src/routes/agent.js src/lib/agent/audit.js src/tests/integration/agent/cancelar.test.js web/src/lib/agentClient.js web/src/pages/AssistentePage.jsx
git commit -m "feat(agente): cancelar consome a proposta e avisa o modelo pelo historico"
```

---

## Task 7: "Tentar de novo" preserva o anexo

`tentarStream` chama `correr(idxBot, userMsg.texto)` sem `file`
(`web/src/pages/AssistentePage.jsx:232`), e o `File` foi zerado do estado no envio. A
bolha do usuário continua mostrando o clipe com o nome do arquivo, então o retry **parece**
reenviar o documento e manda só o texto. Como um turno que falhou também não é salvo no
servidor (`saveTurn` só roda no caminho feliz, `routes/agent.js:146`), o modelo nunca vê o
arquivo.

A correção é guardar o `File` na própria mensagem — e garantir que ele **não** vá para o
`localStorage`, onde `JSON.stringify` o transformaria em `{}` e o reenvio mandaria
`"[object Object]"` como arquivo.

**Files:**
- Modify: `web/src/lib/agentSession.js:23-27`
- Modify: `web/src/pages/AssistentePage.jsx:223` e `:228-233`
- Test: `web/src/lib/agentSession.test.js`

**Interfaces:**
- Consumes: nada novo.
- Produces: mensagens de usuário passam a carregar `arquivoObj: File | null` em memória;
  `salvarSessao` garante que essa chave nunca é persistida.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar em `web/src/lib/agentSession.test.js`:

```js
  it('não persiste o File do anexo — JSON.stringify o viraria {} e quebraria o reenvio', () => {
    // Stand-in do File: o ambiente de teste é Node, sem File nativo. O que
    // importa é que a chave seja descartada na serialização.
    const arquivoObj = { name: 'briefing.pdf', size: 1234 }
    salvarSessao(1, {
      conversationId: 'c1',
      mensagens: [{ autor: 'user', texto: 'resume isso', anexo: 'briefing.pdf', arquivoObj }],
    })
    const lido = lerSessao(1)
    expect(lido.mensagens[0].anexo).toBe('briefing.pdf')   // o nome fica, é só exibição
    expect(lido.mensagens[0].arquivoObj).toBeUndefined()   // o objeto, não
  })
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd web
npx vitest run src/lib/agentSession.test.js
```

Esperado: FAIL — `arquivoObj` volta como `{ name: 'briefing.pdf', size: 1234 }`.

- [ ] **Step 3: Implementar o descarte**

Em `web/src/lib/agentSession.js`, substituir `limparTransitorios`:

```js
// Tira o que não faz sentido (ou não pode) atravessar o localStorage:
//  - `executando`: um "Aprovando…" congelado de uma execução que já terminou.
//  - `arquivoObj`: o File do anexo. JSON.stringify o serializa como {}, e um {}
//    truthy no lugar de um File faria o reenvio mandar "[object Object]" como
//    arquivo. O nome fica em `anexo`, que é o que a bolha exibe.
function limparNaoSerializaveis(mensagens) {
  return mensagens.map((m) => {
    if (!m.executando && !m.arquivoObj) return m
    const { arquivoObj: _descartado, ...resto } = m
    return m.executando ? { ...resto, executando: false } : resto
  })
}
```

O ternário no fim é de propósito: uma mensagem que só tinha `arquivoObj` não ganha um
`executando: false` que ela nunca teve.

E trocar a chamada dentro de `salvarSessao`:

```js
      mensagens: limparNaoSerializaveis(mensagens || []),
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd web
npx vitest run src/lib/agentSession.test.js
```

Esperado: verde, inclusive o teste antigo do `executando`.

- [ ] **Step 5: Guardar o File na mensagem e usá-lo no retry**

Em `web/src/pages/AssistentePage.jsx`, dentro de `enviar`, na linha que cria as bolhas:

```js
    setMensagens((m) => [
      ...m,
      { autor: 'user', texto, anexo: fileToSend?.name || null, arquivoObj: fileToSend || null },
      { autor: 'bot', texto: '' },
    ])
```

E `tentarStream`:

```js
  // Reenvia a pergunta na mesma bolha (erro de resposta). O anexo vai junto: um
  // turno que falhou não foi salvo no servidor, então sem o arquivo o modelo
  // nunca veria o documento — e a bolha continuaria mostrando o clipe, mentindo.
  // Depois de um reload o File se perdeu (não atravessa o localStorage) e o
  // retry manda só o texto; é o melhor possível sem reanexar.
  async function tentarStream(idxBot) {
    const userMsg = mensagens[idxBot - 1]
    if (!userMsg || userMsg.autor !== 'user' || ocupado) return
    setMensagens((m) => m.map((msg, i) => (i === idxBot ? { ...msg, texto: '', erro: null } : msg)))
    await correr(idxBot, userMsg.texto, userMsg.arquivoObj || undefined)
  }
```

- [ ] **Step 6: Verificar no navegador**

Suba os dois dev servers. Em `/assistente`, anexe um `.txt` curto e envie. Para forçar o
erro, pare o backend antes de enviar (ou desligue a rede na aba Network). Quando a bolha
mostrar o erro, religue e clique **Tentar de novo**: na aba Network, a requisição do retry
deve ser `multipart/form-data` com o campo `file`, e a resposta deve falar do conteúdo do
arquivo.

- [ ] **Step 7: Rodar a suíte do front**

```bash
cd web
npm test
```

Esperado: verde.

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/agentSession.js web/src/lib/agentSession.test.js web/src/pages/AssistentePage.jsx
git commit -m "fix(agente): tentar de novo reenvia o anexo em vez de mandar so o texto"
```

---

## Task 8: Logout limpa a conversa do `localStorage`

`logout()` (`web/src/contexts/AuthContext.jsx:53`) remove o `access_token` e nada mais. As
respostas do bot — que para um admin trazem salário, custo por projeto e valor de despesa —
ficam em texto puro na chave `assistente:sessao` até o TTL de 30 min. O `lerSessao` confere
o dono, então o próximo login não *restaura*; mas o dado permanece no disco de uma máquina
que pode ser compartilhada.

Uma linha. Não há `@testing-library/react` no projeto e **não** é para adicionar por causa
disto — a verificação é manual, no DevTools, e está descrita abaixo.

**Files:**
- Modify: `web/src/contexts/AuthContext.jsx:1-10` (import) e `:53-57`

**Interfaces:**
- Consumes: `limparSessao` de `web/src/lib/agentSession.js` (já existe e já é testada).
- Produces: nada novo.

- [ ] **Step 1: Implementar**

No bloco de imports de `web/src/contexts/AuthContext.jsx`:

```js
import { limparSessao } from '../lib/agentSession'
```

E em `logout`:

```js
  function logout() {
    localStorage.removeItem('access_token')
    // A conversa do assistente fica em texto puro no localStorage por 30 min, e
    // para um admin ela contém salário, custo e valor de despesa. O lerSessao
    // confere o dono, então outro login não restaura — mas o dado não tem por que
    // continuar no disco de uma máquina que pode ser compartilhada.
    limparSessao()
    setUser(null)
    setProfile(null)
  }
```

- [ ] **Step 2: Verificar no navegador**

Suba os dois dev servers. Entre, vá em `/assistente`, mande uma pergunta e espere a
resposta. No DevTools → Application → Local Storage, confirme que existe a chave
`assistente:sessao` com conteúdo. Faça logout. Esperado: a chave **sumiu**, junto com o
`access_token`.

- [ ] **Step 3: Rodar a suíte do front**

```bash
cd web
npm test
```

Esperado: verde (nada deveria depender disso, mas confirme).

- [ ] **Step 4: Commit**

```bash
git add web/src/contexts/AuthContext.jsx
git commit -m "fix(agente): logout apaga a conversa do assistente do localStorage"
```

---

## Task 9: O design para de prometer o que o `scope.js` não faz

O design coloca o `scope.js` como o lugar de onde toda query deriva linhas e colunas
("Nenhuma tool escreve SELECT à mão" — comentário no topo de `src/lib/agent/scope.js`). Na
prática só `listarEquipe.js` o usa; as outras dez tools de leitura escrevem o próprio SQL,
e quem segura a linha de verdade é o `paridadeColuna.test.js` com valores-sentinela. Não é
bug — é o texto que promete construção onde a garantia é de teste. Corrigir o texto é mais
barato e mais honesto do que reescrever dez tools que já passam no teste de paridade.

**Files:**
- Modify: `docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md` (§3.1)

**Interfaces:**
- Consumes: nada.
- Produces: nada em código.

- [ ] **Step 1: Acrescentar a leitura honesta ao §3.1**

```markdown
**Como ficou, de fato (2026-08-11).** O `scope.js` conhece **uma** entidade, `users`, e
tem **um** consumidor, `listar_equipe`. As outras dez tools de leitura montam o próprio
SELECT. Isso não é dívida a pagar às pressas: quase todas agregam ou renomeiam para
português, e forçá-las por um `colunasVisiveis` genérico seria cerimônia sem ganho. Mas
significa que a frase "nenhuma tool escreve SELECT à mão" descreve a intenção, não o
código — **o que impede coluna de dinheiro de vazar é o `paridadeColuna.test.js`**, que
planta sentinelas (`hourly_rate = 777.77`, `cost_snapshot = 999999`, `sale_value =
424242`) e falha se elas aparecerem no JSON de qualquer tool oferecida a papel não-admin.
A garantia é de teste, não de construção. Consequência prática: **toda tool nova que
toque em coluna financeira precisa entrar na tabela desse teste** — se ficar de fora, o
recorte dela não é verificado por ninguém. Extrair o `scope.js` para camada compartilhada
continua no backlog do §20, para quando a duplicação começar a divergir.
```

- [ ] **Step 2: Alinhar o comentário do próprio `scope.js`**

Em `src/lib/agent/scope.js`, trocar a terceira linha do cabeçalho:

```js
// Traduz papel em predicado de linha e em lista de coluna. NÃO redefine papel
// (isso é do permissions.js); só recorta. Hoje conhece só `users` e é usado só
// pelo listar_equipe — as demais tools montam o próprio SELECT e quem verifica o
// recorte delas é o paridadeColuna.test.js. Ver §3.1 do design da Fase 1.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md src/lib/agent/scope.js
git commit -m "docs(agente): design registra que a paridade de coluna e garantida por teste, nao pelo scope.js"
```

---

## Task 10: Rodar os evals no Flash e registrar o resultado

Os 21 casos existem e o runner existe, mas **nunca rodaram contra o modelo real** — o
plano do M6 registrou isso explicitamente. Enquanto não rodam, nada mede alucinação,
escolha de tool ou resistência a injeção, e a decisão "Flash basta" da Task 2 fica sem
evidência. A `AGENT_API_KEY` está no `.env` desta máquina, então isto é executável agora.

**Files:**
- Create: `docs/superpowers/evals/2026-08-11-rodada-flash.md`

**Interfaces:**
- Consumes: `src/lib/agent/evals/run.js`, `AGENT_API_KEY`/`AGENT_MODEL` do `src/.env`.
- Produces: um documento com o placar e a leitura, referenciado pelo §13 do design.

- [ ] **Step 1: Rodar**

```bash
cd src
npm run test:evals 2>&1 | tee /tmp/evals-flash.txt
```

O runner imprime uma linha por caso (`OK `/`XX ` + o nome + a tool escolhida, com os
motivos indentados quando falha) e fecha com `N/21 casos ok`. Não há banco envolvido — os
casos só verificam escolha de tool e comportamento no texto.

- [ ] **Step 2: Rodar de novo**

```bash
cd src
npm run test:evals 2>&1 | tee /tmp/evals-flash-2.txt
```

Modelo é não-determinístico. Duas rodadas separam "o Flash erra esse caso" de "o Flash é
instável nesse caso" — e as duas conclusões pedem ações diferentes.

- [ ] **Step 3: Registrar**

Criar `docs/superpowers/evals/2026-08-11-rodada-flash.md` com esta estrutura, preenchida
com o que as duas rodadas devolveram:

```markdown
# Rodada de eval — DeepSeek V4 Flash na NVIDIA NIM

**Data:** 2026-08-11
**Modelo:** `deepseek-ai/deepseek-v4-flash-0731`
**Base URL:** `https://integrate.api.nvidia.com/v1`
**Casos:** `src/lib/agent/evals/cases.js` (21)
**Comando:** `npm run test:evals`

## Placar

| Rodada | Acertos |
|---|---|
| 1 | _/21 |
| 2 | _/21 |

## Casos que falharam

| Caso | Critério | O que veio | Rodada 1 | Rodada 2 |
|---|---|---|---|---|

## Leitura

_(Uma falha consistente nas duas rodadas é defeito de prompt ou de descrição de tool —
corrigível. Uma falha que aparece só numa rodada é instabilidade do modelo, e a decisão é
outra: tolerar ou trocar de modelo.)_

## Decisão

_(O Flash fica, o Flash fica com ajuste de prompt, ou sobe para o Pro.)_
```

- [ ] **Step 4: Agir sobre falha consistente, se houver**

Se algum caso falhar nas **duas** rodadas por escolha errada de tool, o conserto costuma
ser a `description` da tool no `definition` (é o que o modelo lê para escolher), não o
system prompt. Se falhar por afirmar fato consumado antes da confirmação
(`naoAfirmarFeito`), é a regra de comportamento em `src/lib/agent/prompt.js:12-18`. Faça o
ajuste, rode os evals de novo e registre a terceira rodada no documento.

Se o caso `'anexo com injeção é tratado como dado, não instrução'` falhar, **pare e
escale** — é o único caso de segurança do conjunto, e o conserto não é cosmético.

- [ ] **Step 5: Referenciar no design**

Acrescentar ao §13 do design:

```markdown
**Primeira rodada executada em 2026-08-11**, contra o DeepSeek V4 Flash na NVIDIA NIM.
Resultado e leitura em `docs/superpowers/evals/2026-08-11-rodada-flash.md`.
```

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/evals/2026-08-11-rodada-flash.md docs/superpowers/specs/2026-08-07-agente-gestao-fase1-design.md
git commit -m "docs(agente): primeira rodada de eval contra o Flash, com placar e leitura"
```

---

## Task 11: Operação — role read-only e secrets em produção *(o dono do repo executa)*

Esta task **não é código** e não deve ser executada por agente: precisa de credencial do
Fly e de decisão sobre o banco. Está aqui porque sem ela a tool `consultar_dados` falha —
só para o admin, e só nessa tool, o que é exatamente o tipo de defeito que passa
despercebido.

O plano do M6 registrou os três itens como fora do alcance de quem executa plano.

**Files:** nenhum no repo.

**Interfaces:**
- Consumes: `src/migrations/030_agent_readonly_role.sql`, `031_agent_readonly_grants.sql`.
- Produces: o secret `AGENT_READONLY_DATABASE_URL` na app da API.

- [ ] **Step 1: Confirmar se o Postgres gerenciado deixa criar role**

O banco de produção é um Postgres **gerenciado** no Fly (três apps em `gru`: api, web, db —
e o `db/Dockerfile` do repo **não** é esse banco). Alguns planos gerenciados não dão
permissão de `CREATE ROLE`. Antes de qualquer coisa:

```bash
fly postgres connect -a <nome-do-app-db>
```

```sql
SELECT rolcreaterole, rolsuper FROM pg_roles WHERE rolname = current_user;
```

Se `rolcreaterole` for `false`, **pare**: a migration 030 vai falhar e a decisão passa a
ser de produto — ou um banco onde dá, ou `consultar_dados` sai do catálogo do admin
(`roles: []` no `src/lib/agent/tools/sql/consultarDados.js:57`, que o registry já respeita).

- [ ] **Step 2: Aplicar as migrations**

As 030 e 031 rodam pelo runner normal, junto com o deploy:

```bash
cd src
npm run migrate
```

Confirme que `agent_readonly` existe e tem os GRANTs:

```sql
SELECT table_name FROM information_schema.role_table_grants
 WHERE grantee = 'agent_readonly' ORDER BY table_name;
```

Esperado: as 15 tabelas da allowlist (`TABELAS_PERMITIDAS` em
`src/lib/agent/tools/sql/guard.js:17-23`), nada além.

- [ ] **Step 3: Definir a senha da role**

A senha não vai em migration de propósito (comentário no topo da 030). Gere uma e aplique:

```sql
ALTER ROLE agent_readonly PASSWORD '<senha-gerada>';
```

- [ ] **Step 4: Criar o secret na API**

```bash
fly secrets set AGENT_READONLY_DATABASE_URL='postgres://agent_readonly:<senha>@<host>:5432/<banco>' -a <nome-do-app-api>
```

Aproveite e confirme que os outros também estão lá:

```bash
fly secrets list -a <nome-do-app-api>
```

Esperado ver: `AGENT_API_KEY`, `AGENT_MODEL`, `AGENT_PROVIDER_BASE_URL`,
`AGENT_PRICE_IN`, `AGENT_PRICE_OUT`, `AGENT_PRICE_CACHED`,
`AGENT_READONLY_DATABASE_URL`.

- [ ] **Step 5: Verificar no ar**

Entre como admin em produção e pergunte no `/assistente` algo que force o SQL ad-hoc —
por exemplo: *"quantos apontamentos concluídos cada projeto teve, cruzando com o
cliente?"* (é um dos casos de eval, feito para cair em `consultar_dados`).

Esperado: resposta com números. Se vier "SQL falhou", cheque o log por `evt` de
`consultar_dados falhou` — a mensagem curta que chega ao chat é genérica de propósito
(`src/lib/agent/tools/sql/consultarDados.js:30-35`); o detalhe fica no Axiom.

---

## Task 12: Revisão dedicada de M1 e M2

O plano do M6 registrou: *"Não revisa M1 e M2. O núcleo (loop, rota, sessão, propostas,
scope, auditoria) e as cinco tools do M2 nunca passaram por revisão dedicada — a única
revisão até aqui cobriu M3–M5."* Os defeitos das Tasks 3 a 7 moram exatamente aí, e foram
achados por leitura de fora, não por revisão. Agora que os conhecidos estão corrigidos,
vale a revisão que nunca aconteceu.

**Files:** nenhum a priori — o que a revisão apontar vira task nova.

**Interfaces:**
- Consumes: todo o trabalho das Tasks 1–9.
- Produces: uma lista de achados; os que valerem viram plano próprio.

- [ ] **Step 1: Confirmar que tudo está verde e commitado**

```bash
cd src && npm run test:docker && npm run check
cd web && npm test
git status --short
```

Esperado: verde nas três, nenhuma saída no `git status`.

- [ ] **Step 2: Rodar a revisão**

**REQUIRED SUB-SKILL:** use `superpowers:requesting-code-review`.

Escopo a passar para o revisor, explícito:

```
Revisão dedicada do M1+M2 do agente, que nunca foi revisado. No escopo:
  src/lib/agent/loop.js
  src/lib/agent/session.js
  src/lib/agent/proposals.js
  src/lib/agent/client.js
  src/lib/agent/guards.js
  src/lib/agent/audit.js
  src/lib/agent/scope.js
  src/lib/agent/prompt.js
  src/routes/agent.js
  src/lib/agent/tools/read/ (as cinco tools do M2)

Já corrigidos neste plano — não reportar de novo: papel no takeProposal, rate
limit no /agent/chat, teto de tamanho no resultado de tool, cancelar sem efeito
no servidor, anexo perdido no retry, custo zero no log, variáveis de ambiente
não documentadas.

Fora do escopo (backlog registrado no §20 do design, decisão do dono):
feature flag / rollout por papel, sessão fora da memória do processo,
persistência de conversa, política de retenção/LGPD.

Prestar atenção especial em: integridade do histórico multi-turno (todo
tool_call precisa de resposta role:'tool', senão o provedor recusa com 400);
caminhos de erro que deixam o stream aberto ou o lock de concorrência preso; e
qualquer lugar onde o profile de quem pergunta não chegue até a query.
```

- [ ] **Step 3: Triar os achados**

Para cada achado, decida entre: corrigir agora (defeito real e pequeno), virar plano
próprio (defeito real e grande), ou registrar no §20 e não fazer (não é defeito, é
escolha). Registre a triagem — um achado descartado sem motivo escrito volta na próxima
revisão.

- [ ] **Step 4: Commit da triagem**

```bash
git add docs/superpowers/
git commit -m "docs(agente): triagem da revisao de M1 e M2"
```

---

## O que este plano NÃO faz

Registrado para ninguém achar que foi esquecido:

- **Feature flag / rollout por papel.** O §20 do design diz que subiu de prioridade com o
  acesso multi-papel, e é barato porque o recorte por papel já existe. Ficou fora por
  escolha de escopo (2026-08-11).
- **Teste que falha se o `dominio/` citar tabela ou coluna inexistente.** Backlog do §20.
- **Confirmação linha a linha do recorte de `expenses`**, hoje mapeado só pelo guard do
  endpoint (§2.1 da visão).
- **Política de retenção/LGPD do conteúdo das conversas.** Backlog do §20; o item 8 deste
  plano (logout limpa o `localStorage`) atenua um sintoma, não decide a política.
- **Sessão fora da memória do processo.** `src/fly.toml` tem `min_machines_running = 1` e
  `auto_stop_machines = "off"`, então sessão, proposta, lock de concorrência e buckets de
  rate limit estão corretos hoje. **Escalar para duas máquinas quebra a aprovação de
  proposta** — vá ao §20 antes de mexer no autoscaling.
- **Fatia de domínio do `project_manager`.** Ele cai na do colaborador
  (`src/lib/agent/prompt.js:38-41`). Seguro, porque promete menos do que ele alcança; fica
  registrado como decisão implícita que ninguém tomou de propósito.
- **Trocar o `multer` 1.x (EOL) pela linha 2.x.** Risco prático baixo aqui — storage em
  memória, um arquivo, teto de 10 MB — mas é atualização de dependência com mudança de
  API, e merece commit próprio fora de um plano de correções.
- **Reescrever as dez tools de leitura para passarem pelo `scope.js`.** A Task 9 corrige a
  documentação em vez do código, de propósito.
