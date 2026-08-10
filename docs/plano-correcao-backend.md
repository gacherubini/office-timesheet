# Plano de correção — backend pré-produção

**Base:** branch `fix/auditoria-backend-pre-producao` (saída de `feat/agente-fase1-esqueleto`; mergeia de volta pra lá).
**Insumo:** [`auditoria-backend-pre-producao.md`](./auditoria-backend-pre-producao.md) + revisão independente de 5 revisores (Tempo/Relatórios, Férias/Change-requests, Auth/E-mail, Storage/SSRF, Infra).
**Escopo:** backend de produção (`src/**`), **exceto** o agente (`src/lib/agent/**`, `src/routes/agent.js`).
**Regra:** patches pequenos e testáveis, um tema por commit. Nada de "refatorar o mundo".

> Todo achado abaixo tem evidência `arquivo:linha` da revisão. Reconfirmar a linha no momento de implementar (o código pode ter andado).

---

## 1. Veredito sobre a auditoria original

| # | Achado da auditoria | Veredito | Nota |
|---|---|---|---|
| P0-1 | Relatórios em UTC, não SP | **Confirmado** | 4 endpoints + bucketing JS |
| P0-2 | Stop não-atômico (relógio Node vs PG) | **Confirmado** | + double-stop re-notifica |
| P0-3 | Reset de senha falha em silêncio | **Confirmado** | Resend `{error}` ignorado |
| P0-4 | "Hoje" em UTC, não SP | **Confirmado** | 2 helpers `todayValue()` JS |
| #5 | Employee apaga férias aprovada | **Confirmado** | sem filtro de status |
| #6 | Approve/reject férias sem `pending` | **REFUTADO** | guard já existe (`vacations.js:230,281`) |
| #7 | Intern hard-delete qualquer férias | **Confirmado** | sem escopo de papel |
| #8 | Overlap por índice GiST, não EXCLUDE | **Confirmado** | TOCTOU; handler `23505` morto |
| #9 | Change-request sem `pending` | **Confirmado** | approve e reject |
| #10 | Admin PUT não força `completed` | **Confirmado** | entry "running" com `ended_at` trava timer |
| #11 | Uploads `public-read` | **Confirmado** | PII/recibos world-readable |
| #12 | Sem `BUCKET_NAME` → disco efêmero | **Confirmado** | sem `[mounts]` no `fly.toml` |
| #13 | `canManageClients/Suppliers` = qualquer logado | **Confirmado** | employee lê/edita PII |
| #14 | SSRF iCal | **Confirmado** | allowlist furada pelo `.ics` no path |
| #15 | JWT 7d sem revogação; SSE token na query | **Confirmado (parcial)** | só `notifications/stream`; logs próprios são seguros |

**Já sólido — não mexer:** guard `pending` no approve/reject de **férias**; error handler central não vaza stack; storage do token de reset (SHA-256, single-use, 1h); sem combo CORS+credentials; `trust proxy=1`; `requireAuth` usa papel fresco do DB; concorrência de start e double-pause travadas por índice único; sem SQL injection; durações negativas clampadas; `crypto.js` (AES-GCM) ok; `holidays.js` é host fixo; chaves de objeto são UUID (sem path traversal); delete de anexo checa dono/admin; seed admin sem senha default; pool libera conexão nos erros.

---

## 2. Achados novos (além da auditoria)

**P1**
- **SD-1** SSE `/notifications/stream` não recarrega usuário → demitido/inativo recebe por até 7 dias (`notifications.js:73-93`).
- **SD-2** Reset de senha não revoga sessões → token roubado sobrevive ao reset por até 7 dias (`auth.js:100-108` + JWT sem versão).
- **SD-3** Auto-aprovação de change-request: aprovador aprova a **própria** solicitação e recalcula o próprio custo (`timeEntries.js:297`, sem comparar `user_id`).
- **SD-4** SSRF com `redirect:'follow'` → allowlisted 302 → `http://169.254.169.254/...` (metadata) (`calendar.js:35`); erro reflete status = oráculo de port-scan.

**P2**
- **SD-5** Sem índice `(status, started_at)` → todo relatório/dashboard degrada com volume (`006_time_entries.sql:17-19`).
- **SD-6** `cost_snapshot` vira **0** quando `hourly_rate` é NULL → horas somem da folha sem aviso (`timeEntries.js:252`).
- **SD-7** Edição re-precifica histórico pela taxa **atual** (`timeEntries.js:338,514`).
- **SD-8** Stored-XSS: upload de SVG/HTML com `Content-Type` do cliente, `public-read`, sem `Content-Disposition` (`storage.js:45`).
- **SD-9** IDOR nos documentos de projeto: qualquer logado lista/baixa/anexa em qualquer projeto (`projects.js:282,300`).
- **SD-10** Static `/uploads` sem auth no modo local (`app.js:53`).
- **SD-11** Soft-delete de projeto não esconde tasks/board/counts (`projectManagement.js:110,145,189,214`).
- **SD-12** `createNotification` estoura e derruba a request após o INSERT já commitado → retry duplica comentário/task (`notificationsHub.js:55-66`; call sites `taskCollaboration.js:94`, `projectManagement.js:64,302`).
- **SD-13** `/reports/financial`, `/reports/daily-hours` e `GET /tasks` sem paginação/agregação (payroll e project-cost já foram pro SQL — ok).
- **SD-14** Pool sem `connectionTimeoutMillis` nem `statement_timeout` → query pesada trava o pool inteiro, inclusive `/health` (`db.js:22-26`).
- **SD-15** Sem graceful shutdown (SIGTERM derruba requests + SSE; pool não drena) (`server.js:12-18`).
- **SD-16** `migrate` sem `pg_advisory_lock` → deploy rolling corre migration em paralelo (`migrate.js:13-49`).
- **SD-17** Fly sem health check em `/health` (`fly.toml:7-12`) → máquina quebrada fica em rotação.
- **SD-18** Approve de férias não encerra timer já rodando (`blockTimerDuringVacation` só em start/resume).
- **SD-19** JWT_SECRET sem checagem de força (aceita `"secret"`) (`jwt.js:3-4`).
- **SD-20** `err.message` cru devolvido em várias rotas (`notifications.js`, `calendar.js`, `users.js`).
- **SD-21** SSE `clients` Map sem teto por usuário; heartbeat-catch não faz `removeClient` (`notifications.js:99-107`).

**P3**
- Dockerfile Node 20 vs CI Node 22 (sem `engines`); `NUMERIC → Number` (drift de centavos); `/admin/ping` público; `/health` vaza `err.message`; senha mínima 6; login timing enumeration + forgot-password timing; admin se auto-desativa/troca papel via `PUT /users/:id`; sem rate limit; sem `helmet`/`x-powered-by`; `express.json()` sem limite explícito; CORS reflete qualquer origem sem `ALLOWED_ORIGIN`; bcrypt custo 10; férias sem tamanho máximo; range de relatório fechado (`<= 23:59:59`); admin PUT não registra `edited_by`; N+1 em `notifyAdmins`; default de mês em `me/stats` é UTC.

---

## 3. Plano por lotes (cada lote = 1 commit testável)

### Lote 1 — Fuso `America/Sao_Paulo` (P0-1, P0-4, +SD para "hoje/mês")
- `reports.js`: trocar `startOfDayIso/endOfDayIso` + os 4 filtros de `time_entries` (financial, daily-hours, payroll, project-cost) pelo range half-open SP do `dashboard.js:25-26`; bucketing JS (`slice(0,10)`) → `(started_at AT TIME ZONE 'America/Sao_Paulo')::date`.
- `me.js` (stats/monthly-history) e `projects.js` (my-hours): "hoje"/"mês" em SP, não `toISOString()`.
- `vacationRequests.js:25` e `timeEntries.js:13`: remover os `todayValue()` JS; usar `(now() AT TIME ZONE 'America/Sao_Paulo')::date` no SQL.
- **Testes:** entry `2026-08-09 22:30-03` entra no relatório de `08-09` e **não** no `08-10`; férias com `start_date` = hoje-SP não é rejeitada como passado; bloqueio de timer correto na virada 21h–00h.
- **Aceite:** relatório do dia bate com o dashboard para o mesmo range.

### Lote 2 — Stop atômico + edições de ponto (P0-2, #10, cluster P2)
- `POST /time-entries/stop`: um único `UPDATE ... WHERE user_id=$1 AND status='running' RETURNING *`; duração e `ended_at` do **mesmo** relógio (SQL); fechar pausa aberta (`resumed_at`) na mesma transação; 0 linhas → 404/409 (mata double-stop e double-notify).
- Admin `PUT` time entry: forçar `status='completed'` quando `ended_at` presente; gravar `edited_by/edited_at`.
- `start`: validar projeto `active` e `deleted_at IS NULL`.
- Decisão: setar `status='paused'` no pause **ou** documentar o enum como não-usado (baixo).
- **Testes:** double-stop → 1 completed + 1 rejeitado; stop durante pausa → `resumed_at` preenchido e duração desconta pausa; editar entry running com `ended_at` → vira completed.

### Lote 3 — Integridade de férias & change-requests (#5, #7, #8, #9, SD-3, SD-18)
- Own-DELETE de férias: só `status='pending'` (ou soft-cancel com histórico).
- Admin delete de férias: escopo de papel (intern não apaga de outros/admin) + soft-delete auditável.
- Change-request approve/reject: exigir `status='pending'` nos **dois** caminhos.
- Change-request: rejeitar quando `requester == approver` (SD-3).
- Overlap: **migration** trocando o índice GiST plano por `EXCLUDE USING gist (... WITH &&)`; corrigir `mapVacationError` p/ capturar `23P01`.
- (Opcional) approve de férias que cobre hoje encerra timer aberto (SD-18).
- **Testes:** employee não apaga férias aprovada; approve-após-reject bloqueado; auto-approve bloqueado; inserts concorrentes sobrepostos → 1 falha com erro amigável.

### Lote 4 — Segurança de storage/upload (#11, SD-8, SD-9, #5-storage, SD-10)
- ACL: parar `public-read`; servir objeto privado por **signed URL** (ou no mínimo `Content-Disposition: attachment` + `Content-Type` derivado no servidor + sem SVG/HTML inline).
- Allowlist de MIME em docs/anexos; bloquear/forçar download de `svg`/`html`.
- Documentos de projeto: gate de leitura/escrita por membership/gestão (SD-9).
- Upload→INSERT: delete compensatório se o INSERT falhar; não apagar imagem antiga antes do novo upload dar certo.
- `/uploads` local atrás de `requireAuth` (ou proibir modo local em prod).
- **Testes:** upload de svg → servido como anexo/rejeitado; não-membro não lista docs do projeto; INSERT falho limpa o objeto.

### Lote 5 — SSRF do calendário (#14, SD-4)
- Remover o escape de `.ics` no path; allowlist estrita de host; resolver IP e bloquear privado/link-local/metadata antes de conectar; desabilitar/re-validar redirects; erro genérico (sem oráculo).
- **Testes:** `.ics` em IP interno rejeitado; redirect p/ metadata bloqueado.

### Lote 6 — Auth & e-mail (P0-3, SD-1, SD-2, #13, timing, self-lock, rate limit)
- `email.js`: inspecionar `{ error }` do Resend; em produção **falhar** (não engolir); exigir `FRONTEND_URL` absoluto e `RESEND_FROM` (sem default de sandbox).
- SSE `/notifications/stream`: recarregar usuário e aplicar `is_active`/`deleted_at` (SD-1).
- Reset de senha: `token_version`/`sessions_valid_after`; bumpar no reset; checar em `requireAuth` (SD-2).
- `permissions.js`: `canManageClients/Suppliers` → papel real (operations/admin), não `Boolean(profile)` (#13).
- Login: bcrypt dummy p/ usuário inexistente (tempo constante).
- `PUT /users/:id`: bloquear o admin de mudar o próprio `is_active`/`role`.
- Rate limit em auth + `PUT /me/calendar`.
- **Testes:** usuário inativo → SSE 403; reset invalida token antigo; employee não edita cliente; auto-desativação bloqueada; Resend com erro → API não mente "enviado".

### Lote 7 — Confiabilidade & infra (SD-5, SD-11..SD-17, SD-21, Node/NUMERIC)
- `projectManagement.js`: filtrar `p.deleted_at IS NULL` em `/tasks`, `/tasks/counts`, `/tasks/:id`, `/me/tasks` (SD-11).
- `createNotification`: envolver as chamadas em try/catch (engolir como `notifyAdmins`) — falha de notificação não derruba a request (SD-12).
- Paginação em `/tasks`; agregar/cap em `/reports/financial` e `/daily-hours` (SD-13).
- `db.js`: `connectionTimeoutMillis` + `statement_timeout` (SD-14).
- `server.js`: SIGTERM/SIGINT → `server.close()` + `pool.end()` + fechar SSE (SD-15).
- `migrate.js`: `pg_advisory_lock` (SD-16).
- `fly.toml`: `[[http_service.checks]]` → `/health` (SD-17).
- **Migration:** índice `(status, started_at)` em `time_entries` (SD-5).
- SSE: teto por usuário + `removeClient` no catch do heartbeat (SD-21).
- Dockerfile Node 20 → 22 + `engines`; decidir `NUMERIC` (string/decimal em dinheiro ou manter `Number` documentado).
- **Testes:** soft-delete some com as tasks; falha de notificação não vira 400 no comentário.

### Lote 8 — Polimento P3
`helmet` + `x-powered-by`; `/admin/ping` autenticado; `/health` sem `err.message`; senha mínima ↑; limite explícito em `express.json()`; pin de `ALLOWED_ORIGIN`; bcrypt custo 12; tamanho máx. de férias; range de relatório half-open; `edited_by` no PUT admin; batch em `notifyAdmins`.

---

## 4. Ordem sugerida e linha de corte

**Mínimo pra ir a produção (dinheiro / segurança / recovery):**
Lote 1 → Lote 2 → Lote 3 → Lote 6 → Lote 5 → (de Lote 4: `public-read`/PII e IDOR de docs) → (de Lote 7: health check, graceful shutdown, soft-delete tasks, createNotification).

**Depois do go-live:** resto do Lote 4 e 7, e Lote 8.

## 5. Decisões que precisam de você (produto/infra)
1. **`cost_snapshot` ao editar:** preservar a taxa vigente na época do apontamento, ou repactuar pela atual? (hoje repactua — SD-7).
2. **Storage privado:** migrar para **signed URLs** (mudança maior) ou só endurecer (`attachment` + sem inline)?
3. **Instância única:** manter 1 máquina (SSE em memória) ou ir p/ ≥2 (exige mover SSE/estado pra fora da memória)?
4. **Linha de corte:** arrumar **tudo** agora, ou fechar só o "mínimo pra produção" primeiro e mergear em ondas?

## 6. Checklist operacional (Fly — não é código)
`DATABASE_URL`, `JWT_SECRET` (+ força), `FRONTEND_URL`, `ALLOWED_ORIGIN`, `RESEND_API_KEY` + `RESEND_FROM`, `BUCKET_NAME` + credenciais Tigris, `CALENDAR_ENC_KEY`, `AGENT_ENABLED=false`.
