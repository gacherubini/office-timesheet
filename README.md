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
| `RESEND_API_KEY` | API key do Resend. Vazio = link de reset aparece no console. |

Frontend:

| Variável | Descrição |
| --- | --- |
| `VITE_API_URL` | URL base da API. Se não for definida, usa `/api`. |

## Deploy (Fly.io)

Três apps separados: `office-timesheet-db` (Postgres), `office-timesheet-api` (Node) e `office-timesheet-web` (Caddy estático). O passo-a-passo completo está em `MIGRATION_README.md` (Fase 5).

## CI/CD

O workflow em `.github/workflows/ci-cd.yml` roda em pull requests e pushes para `main`. Executa `npm ci` e `npm run check` na API, `npm ci` e `npm run build` no frontend. No push para `main`, o job de deploy pode disparar webhooks configurados como secrets do GitHub (`API_DEPLOY_WEBHOOK_URL`, `WEB_DEPLOY_WEBHOOK_URL`). Se os secrets não estiverem configurados, o deploy é pulado.

## Segurança

- `src/.env` está no `.gitignore` e nunca deve ser commitado.
- `JWT_SECRET` e credenciais de banco/storage ficam apenas em secrets do Fly em produção (`fly secrets set ...`).
- `node_modules`, builds e arquivos locais do Codex/Claude estão ignorados no Git.

## Licença

ISC, conforme `src/package.json`.
