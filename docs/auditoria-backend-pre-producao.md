# Auditoria de backend — pré-produção

**Data:** 2026-08-09  
**Escopo:** backend de produção do Office Timesheet (API Express + Postgres + storage + e-mail + deploy).  
**Fora de escopo:** agente de gestão (`src/lib/agent/**`, `src/routes/agent.js`, testes do agente).  
**Objetivo:** achar erros de backend que vão doer em produção na segunda-feira, com prioridade e handoff para outro agente corrigir.

---

## Onde foi procurado

### Bootstrap e infra

| Caminho | O que se olhou |
|---|---|
| `src/server.js` | boot, health do DB, process handlers |
| `src/app.js` | rotas montadas, CORS, trust proxy, `/health`, static uploads |
| `src/package.json` | deps e scripts |
| `src/.env.example` | secrets esperados vs o que o código realmente exige |
| `src/Dockerfile` | Node 20, migrate no CMD |
| `src/fly.toml` | região, env, ausência de health checks |
| `.github/workflows/ci-cd.yml` | CI (check + tests) e deploy API/Web |
| `src/scripts/migrate.js` | runner de migrations, seed admin |
| `src/migrations/*.sql` (foco 001–029, não agente) | constraints, índices, enums |

### Auth e permissões

| Caminho | O que se olhou |
|---|---|
| `src/routes/auth.js` | login, forgot/reset password |
| `src/middleware/auth.js` | Bearer JWT + reload do usuário no DB |
| `src/middleware/requireAdmin.js`, `requireApprover.js`, `requireOperationalAccess.js`, `requireProjectManagement.js`, `requireMoneyAccess.js` | gates de papel |
| `src/lib/jwt.js` | secret, algoritmo, TTL 7d |
| `src/lib/password.js` | bcrypt |
| `src/lib/permissions.js` | matriz de papéis (admin, employee, intern, project_manager) |
| `src/lib/crypto.js` | cifra da URL iCal |

### Domínio de negócio (rotas + libs)

| Caminho | O que se olhou |
|---|---|
| `src/routes/timeEntries.js` | start/pause/resume/stop, change requests, admin CRUD, live |
| `src/lib/timeMath.js` | duração e `cost_snapshot` |
| `src/routes/me.js` | profile, history, stats, simulation, active-timer, time-clock-status |
| `src/routes/vacations.js` + `src/lib/vacationRequests.js` | criar/aprovar/rejeitar/apagar, overlap, “hoje” |
| `src/routes/expenses.js` | despesas + upload recibo + approve |
| `src/routes/bonuses.js` | bônus admin |
| `src/routes/projects.js` | CRUD, soft-delete, imagem, documentos, my-hours |
| `src/routes/projectManagement.js` | tasks, status, cronômetro por tarefa |
| `src/routes/projectTemplates.js` | templates |
| `src/routes/taskCollaboration.js` | comentários, anexos, activity |
| `src/routes/clients.js`, `suppliers.js` | CRM + anexos |
| `src/routes/users.js`, `usersBasic.js` | admin de usuários, avatar |
| `src/routes/dashboard.js`, `reports.js` | dashboard admin e relatórios (financial, payroll, daily-hours, project-cost) |
| `src/routes/notifications.js` + `src/lib/notificationsHub.js` | lista + SSE |
| `src/routes/calendar.js` + `src/lib/holidays.js` | iCal, SSRF surface, feriados |
| `src/routes/presences.js` | presença |
| `src/lib/db.js` | pool, type parsers DATE/NUMERIC, `withTransaction` |
| `src/lib/storage.js` | S3/Tigris vs disco local, ACL |
| `src/lib/email.js` | Resend |
| `src/lib/logger.js`, `middleware/errorHandler.js`, `middleware/requestLogger.js` | logs, crash, 500 central |
| `src/migrations/006_time_entries.sql`, `024_one_open_pause_per_entry.sql`, `009_vacations.sql` | unicidade de timer/pausa e “anti-overlap” de férias |

### O que **não** foi auditado em profundidade

- Frontend React (`web/`), além do necessário para entender fluxo
- Código e testes do **agente**
- Carga/performance com dataset grande (só leitura estática de queries)
- Secrets reais na Fly (só o que o código espera)

---

## O que está sólido (não mexer sem motivo)

- `requireAuth` recarrega usuário do DB e respeita `is_active` / `deleted_at` (role no JWT **não** autoriza).
- Um apontamento aberto por usuário: índice parcial `one_open_entry_per_user` + 409.
- Uma pausa aberta por entry: migração `024` + 409.
- Despesas: approve/reject com `AND status = 'pending'`.
- `cost_snapshot` congelado na conclusão do timer.
- Dashboard e vários endpoints de `/me` já filtram com `America/Sao_Paulo`.
- Trust proxy = 1; logs com redaction; uncaught/unhandled → log + exit.
- Migrations transacionais com tabela `_migrations`.
- CI com Postgres real + testes de API antes do deploy em `main`.
- `min_machines_running = 1` (SSE em memória ok enquanto for 1 máquina).

---

## Achados (resumo por severidade)

### P0 — dinheiro / recovery (arrumar antes do go-live)

1. **Relatórios (payroll/financial/etc.) usam fuso do servidor (UTC no Fly), não SP** — horas da noite “somem” ou mudam de dia.  
2. **Stop do timer:** duração com `new Date()` no Node e `ended_at` com `now()` no Postgres; stop não atômico (double-stop).  
3. **Reset de senha:** falha de Resend silenciosa; falta de `FRONTEND_URL` / `RESEND_*` “funciona” sem mandar e-mail útil.  
4. **“Hoje” de férias e bloqueio de timer** no fuso do processo (UTC no Fly), não `America/Sao_Paulo`.

### P1 — integridade / segurança

5. Employee apaga férias **já aprovadas** (`DELETE /me/vacation-requests/:id` sem filtro de status).  
6. Approve/reject de férias sem `status = 'pending'`.  
7. Intern/approver pode hard-delete qualquer férias no admin.  
8. Overlap de férias: índice GiST, **não** constraint EXCLUDE — race cria sobreposição.  
9. Change-request de ponto: approve/reject sem exigir `pending` (reescreve custo).  
10. Admin PUT em time entry com `ended_at` não força `status = 'completed'`.  
11. Uploads `public-read` (recibos, docs, PII).  
12. Sem `BUCKET_NAME` → disco local ephemeral no Fly.  
13. `canManageClients` / `canManageSuppliers` = qualquer logado.  
14. Calendário iCal: SSRF via qualquer `https://…/*.ics`.  
15. JWT 7d sem revogação; SSE com token na query string.

### P2 — confiabilidade / dívida

- Soft-delete de projeto não esconde tasks/board.  
- Start de timer não valida projeto ativo/não deletado.  
- Stop com pausa aberta não fecha `resumed_at`.  
- `status = 'paused'` no enum nunca é setado.  
- `createNotification` quebra a request depois do INSERT da task/comentário.  
- Upload de imagem: apaga antiga antes de gravar a nova.  
- Orphan no S3 se INSERT falhar após upload.  
- `GET /tasks` e relatórios financial sem agregação/paginação suficiente.  
- Sem graceful shutdown; pool sem connection timeout; migrate sem advisory lock.  
- Fly sem health check em `/health`.  
- Anexos sem MIME allowlist; NUMERIC → `Number`; CI Node 22 vs Docker 20; sem rate limit em auth.

### P3

- `/admin/ping` público; `/health` pode vazar `err.message`; senha min 6; login timing enumeration; admin pode se auto-desativar.

---

## P0 detalhado — handoff para outro agente

> **Instrução para o agente executor:** implementar só o bloco P0 abaixo, com testes de regressão onde couber. Não mexer no agente de gestão. Preferir patches pequenos e testáveis. Não “refatorar o mundo”.

### P0-1 — Relatórios no fuso `America/Sao_Paulo`

**Arquivo:** `src/routes/reports.js`  
**Sintoma:** `startOfDayIso` / `endOfDayIso` fazem:

```js
new Date(`${date}T00:00:00`).toISOString()
new Date(`${date}T23:59:59`).toISOString()
```

No Fly (UTC), apontamentos depois de ~21:00 BRT caem no dia UTC seguinte e somem do range pedido.

**Referência correta (já usada no dashboard):** `src/routes/dashboard.js`:

```sql
started_at >= ($1::date AT TIME ZONE 'America/Sao_Paulo')
AND started_at < (($2::date + interval '1 day') AT TIME ZONE 'America/Sao_Paulo')
```

**Fazer:**

1. Substituir filtros de `time_entries` em `/reports/financial`, `/reports/daily-hours`, `/reports/payroll`, `/reports/project-cost` pelo range half-open com `America/Sao_Paulo`.
2. Remover ou deixar de usar `startOfDayIso`/`endOfDayIso` para timestamps de apontamento (datas de expense/bonus `date` podem continuar como `::date` se já estiverem corretas).
3. Ajustar bucket de “dia” nos agregados em JS (hoje usam `toISOString().slice(0,10)` = UTC) para data em SP, **ou** agregar o dia no SQL com `(started_at AT TIME ZONE 'America/Sao_Paulo')::date`.
4. Teste de integração: entry com `started_at` em `2026-08-09 22:30:00-03` deve entrar no report `start_date=end_date=2026-08-09` e **não** no dia 10.

**Aceite:** report do dia bate com o filtro do dashboard para o mesmo range.

---

### P0-2 — Stop do timer atômico e com relógio do banco

**Arquivo:** `src/routes/timeEntries.js` → `POST /time-entries/stop`  
**Sintoma atual:**

1. Lê entry `status = 'running'`.
2. Lê pausas.
3. Calcula duração com `const now = new Date()` (Node).
4. `UPDATE … ended_at = now()` (Postgres) **sem** `AND status = 'running'`.

**Riscos:** skew de relógio → `duration_minutes`/`cost_snapshot` ≠ intervalo real; double-stop (double-click) reescreve e notifica de novo; pausa aberta fica com `resumed_at` null.

**Fazer:**

1. Em **uma** transação (ou um único SQL):
   - travar o apontamento (`SELECT … FOR UPDATE` ou `UPDATE … WHERE user_id=$1 AND status='running' RETURNING *`);
   - se 0 rows → 404;
   - fechar pausas abertas: `UPDATE time_entry_pauses SET resumed_at = <ts_stop> WHERE time_entry_id=$1 AND resumed_at IS NULL`;
   - calcular duração líquida com tempo do **mesmo** relógio (preferir SQL: `EXTRACT(EPOCH FROM (stop_ts - started_at - soma_pausas))/60` arredondado como `timeMath`);
   - setar `status='completed'`, `ended_at`, `duration_minutes`, `cost_snapshot` (rate do user).
2. Manter a semântica de `calculateDurationMinutes` / `calculateCostSnapshot` (meia pra cima, 2 casas) — ideal reutilizar as funções JS se o timestamp único vier do DB (`SELECT now()` uma vez).
3. Testes: double-stop → segundo 404/409 e um só completed; stop durante pausa → duração desconta pausa e `resumed_at` preenchido.

**Aceite:** um único completed por stop; custo bate com o intervalo real no banco; sem pausa órfã aberta.

---

### P0-3 — Reset de senha não pode falhar em silêncio

**Arquivos:** `src/lib/email.js`, `src/routes/auth.js`  
**Sintomas:**

- Resend v4 devolve `{ data, error }` e o código **não inspeciona** `error` (só try/catch).
- Sem `RESEND_API_KEY`, em produção só loga e responde sucesso genérico (link **não** vai pro stdout).
- `FRONTEND_URL` vazio → link `/reset-password?token=...` sem host.
- Default `from` = `onboarding@resend.dev` costuma ser rejeitado em conta real.

**Fazer:**

1. Em `sendResetEmail`:
   - se não houver client Resend e `NODE_ENV === 'production'` → lançar erro (não engolir);
   - `const { data, error } = await resend.emails.send(...)`; se `error`, logar e lançar;
   - dev/test pode continuar imprimindo link no terminal.
2. Em forgot-password (ou no boot):
   - em produção, exigir `FRONTEND_URL` com URL absoluta (`https://…`); se faltar, 503 ou fail-fast no boot;
   - ideal: exigir `RESEND_FROM` em produção (sem default de onboarding).
3. Manter resposta anti-enumeração no body de sucesso quando o e-mail for disparado; se o provedor falhar, preferir **500/503 genérico** + log (melhor que mentir que enviou).
4. Testes unitários em `email.js` / auth mockando Resend com `error` e sem API key em production.

**Aceite:** com Resend falhando, a API não responde “Se o email existir…” como se tivesse enviado com sucesso sem rastro; com env incompleto em prod, falha visível.

**Ops (documentar no PR):** secrets Fly `RESEND_API_KEY`, `RESEND_FROM`, `FRONTEND_URL`.

---

### P0-4 — “Hoje” de negócio em `America/Sao_Paulo`

**Arquivos:**

- `src/lib/vacationRequests.js` → `todayValue()`
- `src/routes/timeEntries.js` → `todayValue()` / `getApprovedVacationForToday` / `blockTimerDuringVacation`
- (mínimo P0) alinhar bloqueio de timer e regra “férias não podem começar no passado”

**Sintoma:** no Fly UTC, entre 21h e 00h BRT o “hoje” local do Node é o dia UTC, e a regra de férias/timer discorda do calendário do escritório. O path do agente já usa `(now() AT TIME ZONE 'America/Sao_Paulo')::date` em alguns pontos — a HTTP route **não**.

**Fazer:**

1. Helper único (ex. em `vacationRequests.js` ou `lib/dates.js`):

   ```js
   // preferível via SQL: (now() AT TIME ZONE 'America/Sao_Paulo')::date
   // ou Intl com timeZone: 'America/Sao_Paulo'
   ```

2. Usar no parse de férias (`startDate.value < today`) e no bloqueio de timer.
3. Preferir a data “hoje” no SQL do bloqueio de timer (uma query, sem `todayValue` em JS).
4. Teste: com relógio simulado / `AT TIME ZONE`, férias aprovadas no dia SP bloqueiam timer; pedido com `start_date = hoje SP` não é rejeitado como passado.

**Aceite:** regras de “hoje” iguais em timer e férias, em SP, independente do TZ do container.

**Opcional no mesmo PR (ainda P0-adjacente):** `me/stats` e `projects/:id/my-hours` usam `toISOString().slice(0,10)` para “hoje” — corrigir se o tempo permitir; senão abrir follow-up P1.

---

## Ordem sugerida de implementação (P0)

1. **P0-1** reports TZ (patch pequeno, alto impacto em folha)  
2. **P0-2** stop atômico  
3. **P0-4** hoje em SP (férias + timer)  
4. **P0-3** e-mail/reset (código + checklist de secrets)

Depois do P0, o próximo pacote natural é o **P1 de férias + change-request pending** (itens 5–10 da lista de achados).

---

## Checklist operacional (não é código)

Confirmar na Fly API antes do go-live:

| Variável | Por quê |
|---|---|
| `DATABASE_URL` | boot |
| `JWT_SECRET` | boot |
| `FRONTEND_URL` | link de reset |
| `ALLOWED_ORIGIN` | CORS (sem isso = aberto) |
| `RESEND_API_KEY` + `RESEND_FROM` | reset de senha |
| `BUCKET_NAME` + credenciais Tigris/AWS | uploads duráveis |
| `CALENDAR_ENC_KEY` | se usam agenda Google |
| `AGENT_ENABLED=false` | agente ainda em build (default do código é ligado) |

Smoke pós-deploy:

1. Login → start/pause/resume/stop → validar `duration_minutes` e `cost_snapshot`  
2. Forgot-password com e-mail real  
3. Relatório do dia com entry à noite (se houver) vs dashboard  
4. Upload e reabrir URL após redeploy  
5. Férias pending → approve  

---

## Nota sobre o agente (só ops)

Rotas `/agent/*` estão montadas em `src/app.js`. Kill switch: `AGENT_ENABLED` (default **true** se ausente). Para produção na segunda com agente incompleto: `AGENT_ENABLED=false`.

---

## Histórico

| Data | O quê |
|---|---|
| 2026-08-09 | Auditoria estática completa do backend (exceto agente); documento criado para handoff P0 |
