# Office Timesheet

Sistema web para controle de horas, apontamentos por projeto e acompanhamento de equipe. API em Node.js/Express, frontend em React/Vite, Postgres como banco e Tigris (S3) para storage. Deploy em Fly.io.

## Funcionalidades

- Login, recuperação e redefinição de senha (JWT + bcrypt + Resend).
- Dashboard do colaborador com KPIs do mês, timer, projetos trabalhados e calendário de aniversariantes.
- Registro de horas com iniciar, pausar, retomar e encerrar apontamentos.
- Histórico de apontamentos por colaborador.
- Dashboard administrativo com resumo de horas, equipe, projetos e aniversariantes.
- Gestão de usuários, cargos, status, telefone, aniversário e avatar.
- Gestão de projetos, valores, status e imagens.
- Relatórios e painel administrativo de apontamentos.
- Upload de imagens via Tigris/S3.
- CI/CD com GitHub Actions.

## Stack

- **Frontend:** React 19, Vite, Tailwind CSS, React Router, Lucide React.
- **Backend:** Node.js 20, Express 5, node-postgres (`pg`), bcryptjs, jsonwebtoken, Multer.
- **Banco:** PostgreSQL 16 (local via Docker Compose, prod no Fly.io).
- **Storage:** Tigris (S3-compatible) via AWS SDK.
- **Email:** Resend (reset de senha).
- **Infra:** Fly.io (3 apps: API, banco, frontend estático com Caddy).
- **CI/CD:** GitHub Actions.

## Estrutura

```text
.
├── .github/workflows/ci-cd.yml
├── db/                      # Fly app do Postgres
│   └── fly.toml
├── src/                     # API Express
│   ├── routes/
│   ├── middleware/
│   ├── lib/
│   ├── migrations/          # SQL files (001..010)
│   ├── scripts/migrate.js
│   ├── Dockerfile
│   ├── fly.toml
│   ├── package.json
│   └── .env.example
├── web/                     # Frontend React/Vite
│   ├── src/
│   ├── Dockerfile
│   ├── Caddyfile
│   ├── fly.toml
│   ├── package.json
│   └── vite.config.js
└── docker-compose.yml       # Postgres local pra dev
```

## Requisitos

- Node.js 20 ou superior.
- npm.
- Docker Desktop (para o Postgres local).

## Configuração Local

1. Clone o repositório:

```bash
git clone <url-do-repositorio>
cd office-timesheet
```

2. Suba o Postgres local:

```bash
docker compose up -d
```

3. Configure as variáveis da API:

```bash
cp src/.env.example src/.env
```

Preencha pelo menos `JWT_SECRET`, `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD`. O `DATABASE_URL` padrão já aponta pro Postgres do `docker-compose`.

4. Instale as dependências da API e rode as migrations:

```bash
cd src
npm ci
npm run migrate
```

5. Instale as dependências do frontend:

```bash
cd ../web
npm ci
```

## Rodando em Desenvolvimento

Em um terminal, a API:

```bash
cd src
npm run dev
```

API em `http://localhost:3333`.

Em outro terminal, o frontend:

```bash
cd web
npm run dev
```

Frontend em `http://localhost:5173`. No desenvolvimento, o Vite encaminha chamadas `/api` para `http://localhost:3333`.

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
- **Temperatura:** `AGENT_TEMPERATURE` (default 0.7 no código). Sem o campo o provedor
  assume 1.0, que é solto demais para escolher ferramenta. Se a mesma pergunta começar a
  cair em tools diferentes, baixe para 0.3–0.4. O código respeita o `0` explícito.
- **Evals:** `npm run test:evals` roda os casos contra o modelo real (precisa de chave e
  rede). Não entra no CI. É a única coisa que responde "o modelo está bom o bastante?" —
  teste automatizado não pega resposta incoerente.

### Trocar de provedor

A arquitetura é agnóstica: cliente OpenAI-compatible com base URL por env. Trocar é mexer
em três variáveis — mas **o identificador do modelo muda junto com o provedor**, e essa é a
armadilha. Levar o nome antigo com a URL nova faz toda requisição virar 404 e derruba o
agente inteiro.

| Provedor | `AGENT_PROVIDER_BASE_URL` | `AGENT_MODEL` |
|---|---|---|
| DeepSeek oficial | `https://api.deepseek.com` | `deepseek-v4-flash` |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | `deepseek-ai/deepseek-v4-flash-0731` |

Depois de trocar, nesta ordem:

1. Confirme o identificador do modelo com **uma** chamada antes de virar a chave em
   produção — nome errado é 404 em tudo.
2. Atualize `src/.env` **e** os secrets do Fly. Divergência entre os dois é como a NIM
   sobreviveu meses na produção enquanto a documentação dizia outra coisa.
3. Rode `npm run test:evals`. Provedores diferentes servem o mesmo peso com parâmetros
   diferentes: na rodada de 2026-08-11 contra a NIM o agente devolveu HTML de página 404
   como resposta, `</think>` cru no meio do texto e trechos em chinês. Nenhum teste
   automatizado pega isso.
4. Meça se o provedor reporta `prompt_tokens_details.cached_tokens`. A NIM não reportava —
   sem isso `AGENT_PRICE_CACHED` é decorativo e o custo logado fica superestimado.

### Pendências de produção

Itens que exigem credencial ou verificação manual e não dão para fechar por código:

- [ ] **Role somente-leitura** (migrations 030/031): confirmar que o Postgres gerenciado do
      Fly aceita `CREATE ROLE`, definir a senha de `agent_readonly` e setar
      `AGENT_READONLY_DATABASE_URL`. Enquanto não existir, `consultar_dados` falha para o
      admin — é a pergunta ad-hoc, o diferencial do papel dele.
- [ ] **Preços** `AGENT_PRICE_IN` / `_OUT` / `_CACHED` com os valores reais da fatura. Sem
      eles o `custo` sai `null` em toda linha `agent_usage` e não há como alertar sobre
      gasto.
- [ ] **Verificação no browser** de cancelar proposta, "tentar de novo" com anexo, e logout
      limpando a conversa. O front não tem teste de página; esses três caminhos foram
      verificados só por leitura de código.
- [ ] **`reasoning_content`**: `streamOnce` só lê `delta.content`. Se o provedor servir o
      modelo como raciocínio e inlinar o rascunho no content, o pensamento entra na resposta
      visível e no histórico. Ver o TODO em `src/lib/agent/client.js`.

## Observabilidade

Cada request da API gera uma linha JSON com método, rota, status, duração e usuário. Em
desenvolvimento sai formatada e colorida no terminal; em produção vai pro stdout (`fly logs`) e,
se configurado, pro [Axiom](https://app.axiom.co).

### Nível de log (`LOG_LEVEL`)

Controla o que sai do logger. Níveis, do mais verboso ao mais silencioso:
`trace`, `debug`, `info`, `warn`, `error`, `fatal`.

| Ambiente | Padrão | O que aparece |
| --- | --- | --- |
| Produção | `info` | Linha de cada request, avisos (4xx) e erros (5xx). O `/health` fica de fora. |
| Desenvolvimento / teste | `debug` | O mesmo, mais o `/health` e o que for logado em `debug`. |

Para investigar algo em produção dá pra subir a verbosidade temporariamente:

```bash
fly secrets set LOG_LEVEL=debug -a office-timesheet-api   # investigação
fly secrets unset LOG_LEVEL -a office-timesheet-api       # volta pro padrão (info)
```

Não deixe `debug` ligado em produção: ele inclui o `/health`, que o Fly bate o tempo todo e que
sozinho gera mais volume que os usuários reais — enche o free tier do Axiom e polui a busca.

### Ligar o Axiom

O token vem do próprio Axiom:

1. Crie uma conta em [app.axiom.co](https://app.axiom.co).
2. Crie um **dataset** (ex.: `office-timesheet`) — é onde os logs ficam guardados.
3. Em **Settings → API tokens**, crie um token com permissão de **ingest** nesse dataset.
   O valor começa com `xaat-` e só aparece uma vez.

Depois, grave os dois como secrets do Fly:

```bash
fly secrets set AXIOM_TOKEN=xaat-... AXIOM_DATASET=office-timesheet -a office-timesheet-api
```

Sem essas variáveis a API funciona normalmente, logando só no stdout.

### Queries (APL)

```sql
-- p50/p95/p99 ao longo do tempo
['office-timesheet']
| where isnotnull(duracao_ms)
| summarize p50=percentile(duracao_ms,50),
            p95=percentile(duracao_ms,95),
            p99=percentile(duracao_ms,99)
  by bin_auto(_time)

-- rotas mais lentas
['office-timesheet']
| where isnotnull(duracao_ms)
| summarize p99=percentile(duracao_ms,99), qtd=count() by route
| order by p99 desc

-- taxa de erro
['office-timesheet']
| summarize erros=countif(status >= 500), total=count() by bin_auto(_time)

-- investigar um usuário
['office-timesheet']
| where user_id == 42
| order by _time desc

-- seguir um request específico (traz a linha do request e os erros dele)
['office-timesheet']
| where req_id == "cole-o-req-id-aqui"

-- conexões SSE: quanto tempo o pessoal fica com a aba aberta
['office-timesheet']
| where evento == "stream_encerrado"
| summarize qtd=count(), mediana_min=percentile(duracao_conexao_ms,50)/60000 by bin_auto(_time)
```

O `req_id` aparece no header `x-request-id` de toda resposta e no corpo das respostas 500. Ele
também carimba automaticamente os logs de erro das rotas, então a query "seguir um request
específico" devolve a linha do request **e** o erro que a explica.

### Streaming (SSE) e latência

O `GET /notifications/stream` é uma conexão de longa duração: fica aberta enquanto o usuário
estiver com a aba aberta. O tempo dela não é tempo de resposta, então ela **não** gera
`duracao_ms` — sai como `evento: "stream_encerrado"` com o tempo de conexão em
`duracao_conexao_ms`. É por isso que as queries de percentil filtram por `isnotnull(duracao_ms)`:
sem esse cuidado uma aba aberta a tarde inteira dominaria o p95/p99 da API inteira.

### Privacidade dos logs

O usuário é identificado por `user_id` numérico — nunca por e-mail ou nome. Token, senha e cookie
são censurados antes de qualquer serialização, e a URL registrada nos erros vai sem a query string
(o SSE recebe o token por `?token=...`).

O **IP do cliente é gravado por inteiro** no log center, sem máscara. É uma escolha deliberada:
mascarar inutilizaria os logs para investigar abuso. Isso significa que o Axiom guarda endereços
IP de usuários pelo período de retenção do dataset (~30 dias).

## Scripts

API:

```bash
cd src
npm run dev       # inicia com nodemon
npm start         # inicia com node
npm run migrate   # aplica migrations pendentes + seed admin
npm run check     # valida sintaxe dos arquivos .js
```

Frontend:

```bash
cd web
npm run dev       # servidor Vite
npm run build     # build de produção
npm run preview   # preview do build
```

## Variáveis de Ambiente

API (`src/.env`):

| Variável | Descrição |
| --- | --- |
| `PORT` | Porta da API. Padrão: `3333`. |
| `DATABASE_URL` | Connection string do Postgres. |
| `JWT_SECRET` | Segredo de assinatura dos JWTs. Mínimo 32 chars aleatórios. |
| `INITIAL_ADMIN_EMAIL` | Email do admin inicial criado pelo seed da migration. |
| `INITIAL_ADMIN_PASSWORD` | Senha temporária do admin inicial. |
| `FRONTEND_URL` | URL do frontend, usada no fluxo de reset de senha. |
| `ALLOWED_ORIGIN` | Origem permitida no CORS. Aceita múltiplas origens separadas por vírgula. |
| `AWS_ACCESS_KEY_ID` | Credencial do Tigris/S3. Vazio desabilita upload. |
| `AWS_SECRET_ACCESS_KEY` | Credencial do Tigris/S3. |
| `AWS_ENDPOINT_URL_S3` | Endpoint do bucket S3-compatible. |
| `AWS_REGION` | Region (Tigris usa `auto`). |
| `BUCKET_NAME` | Nome do bucket. |
| `RESEND_API_KEY` | API key do Resend. Vazio = link de reset aparece no terminal (só fora de produção). |
| `LOG_LEVEL` | Nível do logger. Padrão: `info` em produção, `debug` fora dela. Ver [Observabilidade](#observabilidade). |
| `AXIOM_TOKEN` | Token de ingest do Axiom (`xaat-...`). Vazio = logs só no stdout. |
| `AXIOM_DATASET` | Nome do dataset no Axiom. |
| `USER_CACHE_DISABLED` | `1` desliga o cache de perfil em memória (`src/lib/userCache.js`) sem redeploy. Vazio = cache ligado. Ver [Problemas conhecidos](#problemas-conhecidos). |
| `USER_CACHE_TTL_MS` | TTL do cache de perfil em ms. Padrão: `60000` (60s). |

Frontend:

| Variável | Descrição |
| --- | --- |
| `VITE_API_URL` | URL base da API. Se não for definida, usa `/api`. |

## Deploy (Fly.io)

Três apps separados: `office-timesheet-db` (Postgres), `office-timesheet-api` (Node) e `office-timesheet-web` (Caddy estático). O passo-a-passo completo está em `MIGRATION_README.md` (Fase 5).

## CI/CD

O workflow em `.github/workflows/ci-cd.yml` roda em pull requests e pushes para `main`. Executa `npm ci` e `npm run check` na API, `npm ci` e `npm run build` no frontend. No push para `main`, o job de deploy pode disparar webhooks configurados como secrets do GitHub (`API_DEPLOY_WEBHOOK_URL`, `WEB_DEPLOY_WEBHOOK_URL`). Se os secrets não estiverem configurados, o deploy é pulado.

## Problemas conhecidos

### Flake intermitente na suíte de testes (~10%)

A suíte de integração (`npm test` na API) falha em ~10-15% das execuções do
**suite completo**, num teste de integração **aleatório** — visto em:

- `src/tests/integration/timer.test.js` → "resume é bloqueado durante férias" (`pause` volta 404)
- `src/tests/integration/costSnapshot.test.js` → "usuário com valor/hora 0" (`project-earnings` vazio)
- `src/tests/integration/vacationRequests.test.js` → "dono cancela a própria férias"

Sintoma sempre igual: **uma linha recém-criada/commitada por uma request não é
encontrada pela request seguinte**. Como o CI (`ci-cd.yml`) roda `npm test`,
isso deixa o CI vermelho ocasionalmente — **re-run resolve**.

**Não é bug de dados nem do cache de perfil** (`src/lib/userCache.js`). O cache
só afeta a identidade da request (correta, chaveada pelo id do token) e a
velocidade/uso de memória; as queries que falham filtram `time_entries` por
`user_id` e nem passam pelo cache. O que acontece é que o cache acelera as
requests autenticadas e, por timing/GC, **expõe um race latente que já existe no
harness de teste** (banco compartilhado + pool de conexões `pg` + ordenação
async). O código original (sem o cache) roda ~50x sem falhar; com o cache,
~10%. Ligar `USER_CACHE_DISABLED=1` **não** resolve (o flake não vem de servir o
cache), e fechar conexões SSE órfãs também **não** resolveu.

**Kill-switch:** `USER_CACHE_DISABLED=1` desliga o cache sem redeploy (não
corrige o flake, mas remove o cache se ele causar problema em produção).

**Para atacar o race de verdade** (separado, não trivial): provável isolamento
transacional por teste (cada teste numa transação com rollback), ou investigar
reuso de conexão suja no pool `pg`. Fechar SSE já foi testado e descartado.

## Segurança

- `src/.env` está no `.gitignore` e nunca deve ser commitado.
- `JWT_SECRET` e credenciais de banco/storage ficam apenas em secrets do Fly em produção (`fly secrets set ...`).
- `node_modules`, builds e arquivos locais do Codex/Claude estão ignorados no Git.

## Licença

ISC, conforme `src/package.json`.
