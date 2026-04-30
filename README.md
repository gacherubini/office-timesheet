# Office Timesheet

Sistema web para controle de horas, apontamentos por projeto e acompanhamento de equipe. O projeto tem uma API em Node.js/Express, frontend em React/Vite e integração com Supabase para autenticação, banco de dados e storage.

## Funcionalidades

- Login, recuperação e redefinição de senha via Supabase Auth.
- Dashboard do colaborador com KPIs do mês, timer, projetos trabalhados e calendário de aniversariantes.
- Registro de horas com iniciar, pausar, retomar e encerrar apontamentos.
- Histórico de apontamentos por colaborador.
- Dashboard administrativo com resumo de horas, equipe, projetos e aniversariantes.
- Gestão de usuários, cargos, status, telefone, aniversário e avatar.
- Gestão de projetos, valores, status e imagens.
- Relatórios e painel administrativo de apontamentos.
- Upload de imagens para Supabase Storage.
- CI/CD com GitHub Actions.

## Stack

- **Frontend:** React 19, Vite, Tailwind CSS, React Router, Lucide React.
- **Backend:** Node.js, Express 5, Supabase JS, Multer.
- **Infra/Dados:** Supabase Auth, Database, Row Level Security e Storage.
- **CI/CD:** GitHub Actions.

## Estrutura

```text
.
├── .github/workflows/ci-cd.yml
├── src/                 # API Express
│   ├── routes/
│   ├── middleware/
│   ├── lib/
│   ├── package.json
│   └── .env.example
└── web/                 # Frontend React/Vite
    ├── src/
    ├── package.json
    └── vite.config.js
```

## Requisitos

- Node.js 22 ou superior recomendado.
- npm.
- Projeto Supabase configurado.
- Buckets públicos no Supabase Storage para imagens, quando usar uploads:
  - `project-images`
  - `user-avatars`

## Configuração Local

1. Clone o repositório:

```bash
git clone <url-do-repositorio>
cd office-timesheet
```

2. Configure as variáveis da API:

```bash
cp src/.env.example src/.env
```

Preencha `src/.env`:

```env
PORT=3333
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
FRONTEND_URL=http://localhost:5173
ALLOWED_ORIGIN=http://localhost:5173
```

3. Instale as dependências da API:

```bash
cd src
npm ci
```

4. Instale as dependências do frontend:

```bash
cd ../web
npm ci
```

## Rodando em Desenvolvimento

Em um terminal, rode a API:

```bash
cd src
npm run dev
```

A API ficará disponível em:

```text
http://localhost:3333
```

Em outro terminal, rode o frontend:

```bash
cd web
npm run dev
```

O frontend ficará disponível em:

```text
http://localhost:5173
```

No desenvolvimento, o Vite encaminha chamadas `/api` para `http://localhost:3333`.

## Scripts

API:

```bash
cd src
npm run dev      # inicia com nodemon
npm start        # inicia com node
npm run check    # valida sintaxe dos arquivos .js
```

Frontend:

```bash
cd web
npm run dev      # servidor Vite
npm run build    # build de produção
npm run preview  # preview do build
```

## Variáveis de Ambiente

API (`src/.env`):

| Variável | Descrição |
| --- | --- |
| `PORT` | Porta da API. Padrão: `3333`. |
| `SUPABASE_URL` | URL do projeto Supabase. |
| `SUPABASE_ANON_KEY` | Chave pública anon do Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service role usada pela API para operações administrativas. |
| `FRONTEND_URL` | URL do frontend, usada no fluxo de reset de senha. |
| `ALLOWED_ORIGIN` | Origem permitida no CORS. Aceita múltiplas origens separadas por vírgula. |

Frontend:

| Variável | Descrição |
| --- | --- |
| `VITE_API_URL` | URL base da API. Se não for definida, usa `/api`. |

## CI/CD

O workflow em `.github/workflows/ci-cd.yml` roda em pull requests e pushes para `main`.

Ele executa:

- `npm ci` e `npm run check` na API.
- `npm ci` e `npm run build` no frontend.

No push para `main`, o job de deploy pode disparar webhooks configurados como secrets do GitHub:

| Secret | Uso |
| --- | --- |
| `API_DEPLOY_WEBHOOK_URL` | Webhook para deploy da API. |
| `WEB_DEPLOY_WEBHOOK_URL` | Webhook para deploy do frontend. |

Se os secrets não estiverem configurados, o workflow apenas pula o deploy correspondente.

## Segurança

- O arquivo `src/.env` não deve ser commitado.
- A `SUPABASE_SERVICE_ROLE_KEY` deve ficar apenas no backend e nos secrets do ambiente de produção.
- `node_modules`, builds e arquivos locais do Codex estão ignorados no Git.

## Licença

Este projeto usa a licença ISC, conforme definido no `package.json` da API.
