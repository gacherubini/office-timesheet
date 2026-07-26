# Observabilidade da API — logs estruturados e p99 (Design)

Data: 2026-07-26
Escopo: **backend only** (`src/`). Instrumenta a API Express com log estruturado por request,
tratamento central de erros e envio para um log center externo (Axiom). Não toca no frontend
(`web/`) nem no schema do banco.

## Contexto

A API não tem nenhuma observabilidade hoje:

| Item | Situação atual |
|---|---|
| Log de requests | Inexistente |
| Formato dos logs | `console.log`/`console.error` em texto solto — 48 ocorrências em `routes/`, `lib/`, `middleware/` |
| Error handler central | Inexistente — `src/app.js` termina nas rotas, sem handler de erro e sem 404 |
| Destino dos logs | stdout → `fly logs`, buffer efêmero sem busca, filtro ou agregação |
| Latência | Não medida |

Consequência prática: quando um usuário relata "deu erro" ou "está lento", não existe registro
para investigar.

Decisões tomadas no brainstorming:

1. **Escopo: só a API.** Erros de frontend e queries lentas do Postgres ficam para passos futuros.
2. **Log center: Axiom** (free tier, ~30 dias de retenção). Critério decisivo foi retenção +
   simplicidade de setup, não preço — os três candidatos avaliados (Axiom, Grafana Cloud,
   Better Stack) são gratuitos no volume deste sistema.
3. **Necessidades cobertas:** dashboard visual, busca por usuário/request, p99. Alertas ficam
   para depois (o Axiom suporta; é configuração de UI, não de código).

### Estimativa de volume

~30 usuários × ~500 requests/dia ≈ 450 mil requests/mês × ~400 bytes ≈ **180 MB/mês**, com
`/health` excluído. Fica muito abaixo do free tier do Axiom. O `/health` sozinho geraria mais
volume que os usuários reais — daí a decisão de não enviá-lo.

## Objetivos

1. Todo request gera uma linha JSON com método, rota, status, duração e usuário.
2. p50/p95/p99 calculáveis por período e por rota.
3. Um `req_id` correlaciona todas as linhas de um mesmo request.
4. Erros não tratados são capturados e registrados com stack em vez de sumirem.
5. Dados sensíveis (token, senha, cookie) nunca saem do servidor.
6. As 11 suítes de integração existentes continuam verdes.

## Fora de escopo

- Captura de erros do frontend React (Sentry ou equivalente).
- Log de queries lentas do Postgres.
- Alertas automáticos (e-mail/Slack) — configuráveis na UI do Axiom depois.
- Tracing distribuído / OpenTelemetry.
- **Refactor dos ~130 blocos `catch`** que devolvem `400` (ver "Dívida identificada").

## Arquitetura

```
Request
   ↓
[requestLogger]        gera req_id, cronometra, loga na resposta
   ↓
rotas existentes       (inalteradas)
   ↓
[notFound]             404 padronizado
[errorHandler]         captura o que escapar, loga com stack, devolve 500
   ↓
stdout (JSON) ─┬─→ fly logs   (tempo real, debug do dia a dia)
               └─→ Axiom      (busca, dashboard, p99, ~30 dias)
```

### Arquivos novos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/logger.js` | Instância única do pino. Decide destino e formato por ambiente. Não conhece Express. |
| `src/middleware/requestLogger.js` | `pino-http` configurado: req_id, extração de `route`, nível por status, censura. |
| `src/middleware/errorHandler.js` | Exporta `notFound` e `errorHandler`. |

Cada unidade é testável isolada: `logger.js` não depende de request; `requestLogger.js` recebe o
logger por import e é exercitável com Supertest; `errorHandler.js` é função pura de middleware.

### Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `src/app.js` | `trust proxy`; pluga `requestLogger` antes das rotas; `notFound` + `errorHandler` depois. |
| `src/server.js` | `logger` no lugar de `console`; handlers de `uncaughtException` e `unhandledRejection`. |
| `src/lib/db.js` | `console.error` do pool → `logger.error`. |
| `src/middleware/auth.js` | `console.error` → `logger.error`. |
| `src/lib/notificationsHub.js` | `console.error` → `logger.error`. |
| `src/package.json` | `+ pino`, `+ pino-http`, `+ @axiomhq/pino`; `+ pino-pretty` em devDependencies. |
| `src/.env.example` | `+ LOG_LEVEL`, `+ AXIOM_TOKEN`, `+ AXIOM_DATASET`. |

`src/fly.toml` não muda — as credenciais entram via `fly secrets set`.

## Formato do log

```json
{
  "level": "info",
  "time": "2026-07-26T14:32:07.881Z",
  "req_id": "01J8Z3K9F2",
  "method": "POST",
  "route": "/projects/:id/tasks",
  "status": 201,
  "duracao_ms": 87,
  "user_id": 42,
  "ip": "189.4.x.x"
}
```

### Campos

| Campo | Origem | Por quê |
|---|---|---|
| `req_id` | gerado por request | Correlaciona todas as linhas de um mesmo request. |
| `method` | `req.method` | — |
| `route` | `req.baseUrl + req.route?.path`, lido **após** o roteamento | Padrão da rota, não URL concreta (ver abaixo). |
| `status` | `res.statusCode` | Taxa de erro. |
| `duracao_ms` | cronômetro do `pino-http` | **Base do cálculo de p50/p95/p99.** |
| `user_id` | `req.profile?.id` | Investigar caso individual sem expor dado pessoal. |
| `ip` | `req.ip` | Requer `app.set('trust proxy', true)` — ver abaixo. |
| `err` | só em 5xx | Stack trace. |
| `erro_msg` | só em 4xx | Mensagem devolvida ao cliente — ver "Captura da mensagem de 4xx". |

**`trust proxy`:** no Fly a aplicação fica atrás do proxy da plataforma. Sem
`app.set('trust proxy', true)` em `src/app.js`, `req.ip` registra o IP interno do proxy — o mesmo
para todos os usuários, portanto inútil. Com a flag, o Express lê `X-Forwarded-For`. Essa linha
faz parte do escopo.

**`route` e não `url` (decisão explícita):** guardar `/projects/318/tasks` faria cada projeto
virar uma série distinta, tornando impossível agregar por rota. Guardamos `/projects/:id/tasks`.
Requests que não casam com nenhuma rota (404) registram `route: "unmatched"`.

**`user_id` só existe em rotas autenticadas**, porque `req.profile` é preenchido pelo
`requireAuth` (`src/middleware/auth.js:34`). Em `/auth/*` o campo vem ausente — comportamento
esperado, não bug.

### Níveis

| Situação | Nível | Enviado ao Axiom |
|---|---|---|
| `GET /health` | `debug` | Não (em produção, `LOG_LEVEL=info`) |
| 2xx / 3xx | `info` | Sim |
| 4xx | `warn` | Sim, com a mensagem de erro devolvida |
| 5xx | `error` | Sim, com stack |

`LOG_LEVEL` controla o corte. Padrão: `info` em produção, `debug` em desenvolvimento, `silent`
em teste.

## Privacidade

Lista de censura fixa no `logger.js`, aplicada antes de qualquer serialização:

- Headers `authorization` e `cookie` → `[Redacted]`. Sem isso, o JWT de um admin ficaria em texto
  puro num serviço de terceiros, permitindo personificação.
- Campos `password`, `senha`, `token`, `newPassword` em qualquer corpo → `[Redacted]`.
- **O corpo do request não é logado por padrão.** Só campos explicitamente escolhidos.
- Identificação por `user_id` numérico — nunca e-mail ou nome.

## Tratamento de erros

### Dívida identificada (fora de escopo, registrada aqui)

Praticamente todas as rotas seguem este padrão (ex.: `src/routes/me.js:117`, e ~130 ocorrências
em 20 arquivos de `src/routes/`):

```js
} catch (err) {
  return res.status(400).json({ error: err.message })
}
```

Isso significa que uma falha de infraestrutura (Postgres fora do ar) é devolvida ao cliente como
`400 Bad Request` com a mensagem interna do erro no corpo. Dois efeitos: a taxa de 5xx aparece
saudável durante uma falha real de servidor, e detalhes internos vazam para o navegador.

**Neste passo, não mexemos nessas rotas.** O `requestLogger` passa a registrar todo 4xx em nível
`warn` com a mensagem devolvida, o que torna o problema visível. A migração de
`catch → next(err)` é um refactor de risco (muda contrato da API) e merece spec própria.

#### Captura da mensagem de 4xx

Como a mensagem só existe no corpo da resposta, o `requestLogger` embrulha `res.json` para
guardar o campo `error` do payload em `req._erroMsg` quando `status >= 400`, e o lê no
callback de fim de request. Restrições:

- Só o campo `error` é capturado, nunca o corpo inteiro — evita vazar dado de negócio.
- Truncado em 200 caracteres.
- O wrapper devolve exatamente o que `res.json` original devolveria; nenhuma resposta muda.

### O que este passo entrega

- `notFound`: rotas inexistentes devolvem `404 { error: 'Rota não encontrada.' }` em vez do HTML
  padrão do Express.
- `errorHandler`: captura erros que escapam das rotas (throws fora de `try`, erros do Multer,
  JSON malformado no `express.json()`). Loga com stack completo e `req_id`, devolve
  `500 { error: 'Erro interno.', req_id }` — o `req_id` no corpo permite ao usuário reportar o
  código e você achar o log exato.
- `server.js`: `uncaughtException` e `unhandledRejection` são registrados antes do processo
  morrer. Hoje derrubam a API em silêncio.

## Resiliência

O envio ao Axiom é assíncrono e best-effort. Token inválido, serviço fora do ar ou limite
estourado **não podem** derrubar um request nem travar a API — nesse caso os logs continuam
saindo em stdout (`fly logs`). Se `AXIOM_TOKEN` estiver vazio, o transporte nem é registrado:
a aplicação roda normalmente só com stdout.

Custo de performance: pino serializa em JSON de forma otimizada e o transporte roda em worker
thread separada. O overhead esperado por request é de microssegundos — irrelevante frente ao
tempo de query do Postgres.

## Testes

Vitest já configurado (`src/vitest.config.js`, `fileParallelism: false`, banco compartilhado).

**Unitários** (`tests/unit/logger.test.js`):
- `authorization` e `cookie` saem como `[Redacted]`.
- `password` / `senha` em corpo saem como `[Redacted]`.
- Nível derivado do status: 200→`info`, 404→`warn`, 500→`error`.

**Integração** (`tests/integration/logging.test.js`, via Supertest):
- Request autenticado produz linha com `route` no formato de padrão (`:id`, não valor concreto).
- `duracao_ms` presente e numérico.
- `GET /health` não emite em nível `info`.
- Rota inexistente devolve `404` JSON.
- `req_id` presente na resposta de erro.

**Regressão:** as 11 suítes de integração existentes devem continuar verdes. O logger fica em
nível `silent` sob `NODE_ENV=test` para não poluir a saída.

## Rollout

Ordem escolhida para entregar valor antes de qualquer cadastro externo:

1. **Local** — pino + `pino-pretty`, log colorido no terminal do `npm run dev`.
2. **Deploy sem Axiom** — `fly logs` já mostra JSON com duração por request. Ponto de validação:
   dá para ver rota, status e `duracao_ms` em produção.
3. **Conta Axiom** — `fly secrets set AXIOM_TOKEN=… AXIOM_DATASET=…`. Confirmar que os eventos
   chegam.
4. **Dashboard** — salvar as queries de p99 e taxa de erro.

### Queries de referência (APL)

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
```

## Critérios de aceite

1. Todo request autenticado produz uma linha JSON com `req_id`, `method`, `route`, `status`,
   `duracao_ms`, `user_id`.
2. `route` contém o padrão da rota, não a URL concreta.
3. `GET /health` não aparece com `LOG_LEVEL=info`.
4. Nenhum log contém token, cookie ou senha em texto puro.
5. Rota inexistente devolve `404` JSON; erro não tratado devolve `500` com `req_id` e gera log
   com stack.
6. Com `AXIOM_TOKEN` vazio, a API sobe e loga normalmente em stdout.
7. `npm test` verde, incluindo as suítes preexistentes.
8. As queries de p50/p95/p99 acima retornam valores no Axiom.

## Próximos passos (specs futuras)

- Migrar `catch (err) { res.status(400) }` → `next(err)` com classe de erro de domínio.
- Captura de erros do frontend React.
- Log de queries lentas do Postgres (wrapper em `src/lib/db.js`).
- Alertas: taxa de 5xx, p99 acima de limiar, API fora do ar.
