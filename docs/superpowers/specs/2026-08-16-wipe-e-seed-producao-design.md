# Wipe do banco de teste e seed do admin inicial

**Data:** 2026-08-16  
**Tipo:** runbook operacional (produção). Não é feature de produto.  
**Objetivo:** apagar todos os dados de teste do Postgres em `office-timesheet-db-iad` e deixar só a conta admin do seed, pronta para o primeiro dia real.

Não execute este documento no automático. É irreversível no banco vivo. Faça com alguém do outro lado, fora do expediente.

---

## O que some e o que fica

**Some (tudo no schema `public`):**
usuários de teste, apontamentos, pausas, projetos, tarefas, clientes, fornecedores, férias, despesas, bônus, notificações, conversas e uso do agente, calendários, presenças, simulações, tabela `_migrations` (reaplica do zero).

**Fica:**
- cluster Fly, volume 5 GB, RAM 1 GB, backups WAL já feitos
- roles do Postgres (`postgres`, `agent_readonly`, `flypgadmin`, `repmgr`) e a senha da `agent_readonly`
- secrets da API (`DATABASE_URL`, `AGENT_READONLY_DATABASE_URL`, `INITIAL_ADMIN_*`, Tigris, etc.)
- arquivos de teste no Tigris (avatares/recibos). URLs antigas deixam de ter linha no banco; o objeto no bucket continua. Não é PII de cliente real se só havia teste. Limpeza do bucket é opcional e fica fora deste wipe.
- frontend, certificado `gestaovoid.com.br`, UptimeRobot, Axiom

Durante o wipe a API responde 503 no `/health`. O UptimeRobot vai mandar e-mail. É esperado.

---

## Pré-checagem (5 minutos)

1. Confirme o app certo: `office-timesheet-db-iad` (não `suite-pg`, não `crm-419`).
2. Confirme que `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD` estão no Fly (`fly secrets list -a office-timesheet-api`). Sem os dois, o seed é pulado e o banco fica sem admin.
3. Anote o e-mail/senha do seed (estão no painel de secrets ou no gerenciador de senhas). Depois do wipe, o login é **esse** par, nome `Admin`.
4. Avise o time: sistema fora por ~5–10 min.
5. Opcional, por paranoia: snapshot extra antes de apagar.

```powershell
fly postgres backup create -a office-timesheet-db-iad -n pre-wipe-teste -i
```

---

## Passo a passo

### 1. Tirar a API de rotação (evita request no meio do DROP)

```powershell
fly machine stop 83d137da7315e8 -a office-timesheet-api
```

Confirme que parou: `fly status -a office-timesheet-api`.

### 2. Apagar o schema (os dados)

No PowerShell, conecte no banco (pede a senha do user `postgres` do cluster — a da `DATABASE_URL`, não a da `agent_readonly`):

```powershell
fly postgres connect -a office-timesheet-db-iad -d office_timesheet_api
```

No prompt `office_timesheet_api=#` cole **exatamente** isto e dê Enter:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
```

Deve responder `DROP SCHEMA` e `CREATE SCHEMA`. Digite `\q` para sair.

Não use `DROP DATABASE`. Não apague o app `office-timesheet-db-iad`. Não mexa no bucket `office-timesheet-db-iad-postgres` (é o backup).

### 3. Subir a API de novo (migrate + seed)

O `Dockerfile` da API roda `node scripts/migrate.js && node server.js`. O migrate recria as 037 tabelas e, com `users` vazia, insere o admin do seed.

```powershell
fly machine start 83d137da7315e8 -a office-timesheet-api
```

Espere o health:

```powershell
curl https://office-timesheet-api.fly.dev/health
```

Esperado: `{"ok":true,"db":"up"}`. Se ficar 503 por mais de 2 minutos, `fly logs -a office-timesheet-api` — procure `SEED ok` e `OK   037_...`.

### 4. Conferir o seed

No `fly postgres connect` de novo:

```sql
SELECT email, name, role, is_active FROM users;
```

Uma linha só: o e-mail do `INITIAL_ADMIN_EMAIL`, role `admin`, `is_active` true.

```sql
SELECT count(*) FROM time_entries;
SELECT count(*) FROM projects;
SELECT filename FROM _migrations ORDER BY 1;
```

`time_entries` e `projects` = 0. `_migrations` deve listar de `001_...` até a última (`037_...` ou posterior).

A role `agent_readonly` sobreviveu (não mora no schema). As migrations 030/031 reaplicam o `GRANT SELECT`. A URL `AGENT_READONLY_DATABASE_URL` continua válida.

### 5. Backup limpo e login

```powershell
fly postgres backup create -a office-timesheet-db-iad -n go-live-limpo -i
```

Abra `https://gestaovoid.com.br`, entre com o e-mail/senha do seed. Troque a senha no perfil **na hora**. O secret `INITIAL_ADMIN_PASSWORD` no Fly não muda sozinho — ele só vale para o seed. Depois que o admin já existe, o migrate não usa mais essa senha.

Opcional, depois do primeiro login com senha nova:

```powershell
fly secrets unset INITIAL_ADMIN_PASSWORD -a office-timesheet-api
```

Isso reinicia a API. Sem o secret, um wipe futuro **não** cria admin até você setar de novo.

### 6. Primeiro dia real

Crie os colaboradores pela tela de pessoas (não reaproveite usuário de teste). Confirme Tigris com um avatar. Confirme o assistente com uma pergunta. “Esqueci a senha” só depois do `RESEND_FROM`.

---

## Se der errado

| Sintoma | O que fazer |
|---|---|
| Health 503 depois do start | `fly logs -a office-timesheet-api`. Migration falhou? Role `agent_readonly` já existia e 030 deve só dar GRANT. |
| Login recusado | E-mail do seed em minúsculas. Senha é a do secret, não uma senha antiga de teste. |
| `consultar_dados` do agente falha | Reaplicar grants: as migrations 030/031 deveriam ter rodado. Se pulou, rode o SQL das duas na mão. |
| Quer os dados de teste de volta | `fly postgres backup restore` para um app **novo** a partir de `pre-wipe-teste`. Não restaure por cima deste cluster sem combinarmos. |
| Dropou o schema errado | Pare. Não continue. Chame quem opera a Fly. |

---

## Fora de escopo

- Apagar objetos no Tigris
- Recriar o cluster / mudar região
- Mexer em `suite-pg` ou apps do org `crm-419`
- Resetar JWT_SECRET (derruba sessão de todo mundo; no wipe não há sessão útil)

---

## Aceite

- Uma linha em `users`, admin ativo.
- Zero apontamentos e projetos.
- `/health` 200.
- Login no `gestaovoid.com.br` com o seed.
- Backup `go-live-limpo` em `DONE`.
