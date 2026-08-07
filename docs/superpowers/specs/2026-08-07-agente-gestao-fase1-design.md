# Design — Agente de Gestão (Fase 1: núcleo reativo no site)

**Data:** 2026-08-07
**Status:** design para revisão
**Autor:** brainstorming assistido (Claude Code)

---

## 1. Objetivo

Um agente conversacional embutido no site do Office Timesheet, para **admin/gestão**, que
responde perguntas sobre os dados do sistema (projetos, tasks, apontamentos, financeiro,
pessoas) **e** executa ações de escrita **sempre com confirmação humana**. O foco da Fase 1
é o *cérebro reativo*: o usuário pergunta/pede, o agente responde/propõe. Automação
agendada, Calendar, relatórios em PDF e WhatsApp ficam para fases posteriores.

Princípios que guiam o design:

- **O modelo nunca é a fonte da verdade.** Todo dado vem de query/função; o modelo só
  orquestra e redige. Isso mata a alucinação de dados na raiz.
- **O modelo propõe, o código executa.** Nenhuma escrita acontece sem confirmação.
- **Agnóstico de modelo.** Cliente OpenAI-compatible; trocar de modelo é config.
- **YAGNI.** Só o que a Fase 1 precisa; o resto é backlog registrado.

---

## 2. Escopo

### Dentro da Fase 1

- Serviço de agente dentro da API Express existente (`src/`).
- Cliente de LLM agnóstico (OpenAI-compatible via OpenRouter), padrão **DeepSeek V4 Flash**,
  trocável por Kimi/Gemini em uma linha de config.
- **Arquivo de contexto de domínio** (schema anotado + glossário + allowlist), cacheado no
  prompt.
- **Tools de leitura curadas** (ver §6.1).
- **Tool de SQL de leitura restrito** (allowlist, role read-only, limite de linhas, timeout).
- **Tools de escrita com confirmação** (propor → preview → aprovar → executar).
- **Camadas de segurança** (ver §7) e **trilha de auditoria** (Axiom).
- **Guardas de execução** (limite de iterações, timeout, teto de tokens).
- **Widget de chat no React** com streaming e UI de confirmação.

### Fora da Fase 1 (backlog)

- **Fase 2:** tarefas agendadas configuráveis pelo ADM (com fila de aprovação para
  escritas), Google Calendar, relatórios em PDF (Tigris), alertas proativos, provisão de
  bônus, leitura de briefings em PDF, memória de preferências, exportações CSV/planilha.
- **Fase 3:** canal WhatsApp — áudio→transcrição (Whisper/Gemini), foto de nota→despesa
  via visão/OCR.

---

## 3. Arquitetura

```
┌──────────────────────────────────────────────────────────────┐
│  Frontend (React/Vite)                                        │
│  - Widget de chat (streaming)                                 │
│  - UI de confirmação (preview do efeito + Aprovar/Cancelar)   │
└───────────────┬──────────────────────────────────────────────┘
                │ HTTP + stream (JWT do admin logado)
┌───────────────▼──────────────────────────────────────────────┐
│  API Express (src/) — módulo agente                           │
│                                                               │
│  routes/agent.js        → endpoints do chat e de execução     │
│  lib/agent/loop.js      → laço de tool-calling (agnóstico)    │
│  lib/agent/client.js    → cliente OpenAI-compatible (config)  │
│  lib/agent/tools/       → registry de tools tipadas           │
│     ├─ read/            → leitura curada                       │
│     ├─ sql/             → SQL de leitura restrito              │
│     └─ write/           → escrita (propõe, não executa)        │
│  lib/agent/context/dominio.md → mapa do domínio (cacheado)    │
│  lib/agent/guards.js    → limites (iterações, tempo, tokens)  │
│  lib/agent/audit.js     → trilha de auditoria (logger/Axiom)  │
│                                                               │
│  Reusa: db.js, permissions.js, jwt.js, logger.js             │
└───────────────┬──────────────────────────────────────────────┘
                │ pg (parametrizado)          │ role read-only
┌───────────────▼─────────────┐   ┌───────────▼─────────────────┐
│  Postgres (usuário app)     │   │  Postgres (role SOMENTE      │
│  leitura + escrita curadas  │   │  leitura, allowlist)         │
└─────────────────────────────┘   └──────────────────────────────┘
```

O agente roda **como o admin logado**: todas as tools executam sob o RBAC dele
(`permissions.js`). O modelo não tem credencial própria — ele só chama funções que checam
permissão.

**Núcleo agnóstico de canal (pré-requisito para a Fase 3).** O laço do agente
(`lib/agent/loop.js`) e as tools são um **serviço reutilizável**, sem acoplamento à camada
HTTP/site. Na Fase 1 o único adaptador é o site; na Fase 3, o WhatsApp via **Evolution API**
chama exatamente esse mesmo serviço. Por isso, já na Fase 1, a lógica de agente fica separada
do `routes/agent.js` — o objetivo "WhatsApp ser a mesma coisa que o site" depende disso.

---

## 4. Cliente de LLM (agnóstico de modelo)

- Biblioteca `openai` (npm) apontada para o base URL do **OpenRouter**; formato de
  *function calling* da OpenAI, suportado por DeepSeek, Kimi e Gemini em modo compatível.
- Configuração por ambiente:
  - `AGENT_PROVIDER_BASE_URL` (padrão: OpenRouter)
  - `AGENT_API_KEY`
  - `AGENT_MODEL` (padrão: `deepseek/deepseek-v4-flash`)
  - `AGENT_MAX_ITERATIONS`, `AGENT_MAX_TOKENS`, `AGENT_TIMEOUT_MS`
- Trocar de modelo (Kimi K2.6, Gemini 3 Flash-Lite, etc.) = mudar `AGENT_MODEL`. Decisão
  final adiada para fase de A/B; sem restrição de privacidade (usuário optou por custo).
- **Prompt caching:** manter prefixo estável (system prompt + arquivo de contexto +
  definições de tools) para aproveitar o desconto de cache-hit de cada provedor. É a
  principal alavanca de custo.

---

## 5. Arquivo de contexto de domínio (`dominio.md`)

Documento versionado que descreve o projeto para o agente. **Fonte única** do schema, do
glossário e da allowlist.

Conteúdo:

- **Schema anotado:** tabelas/colunas/relações que o bot pode consultar (apenas as da
  allowlist). Ex.: `time_entries`, `projects`, `expenses`, `bonuses`, `vacations`,
  `presences`, `users`, `tasks`, `clients`.
- **Glossário de negócio:** definições e fórmulas — "apontamento", "margem = valor −
  custo de horas − despesas", "projeto no vermelho", "sobrecarga", "ociosidade".
- **Enums explicados:** status de task (`in_review`, `abandoned`, …), tipos de task,
  papéis de projeto.
- **Joins canônicos / dicas de query** para as perguntas mais comuns.
- **O que NÃO tocar** (colunas sensíveis, tabelas fora da allowlist).

Uso: injetado no prefixo cacheado do prompt. Manutenção: **atualizar sempre que uma
migration mexer em tabela relevante** (item de checklist na PR; considerar teste que
falha se a allowlist referenciar tabela/coluna inexistente).

---

## 6. Tools

Todas as tools têm schema de entrada validado (ex.: Zod). Não existe "tool genérica que
faz qualquer coisa".

### 6.1 Leitura curada (executam direto; só leem)

- `resumo_financeiro(periodo)` — faturamento, despesas, margem do período.
- `margem_por_projeto(projeto_id?)` — valor − custo de horas − despesas.
- `projecao_estouro(projeto_id)` — no ritmo atual, quando o orçamento de horas estoura.
- `simulacao_performance(...)` — lê `performance_simulations` e explica cenários.
- `horas_por_projeto(periodo)` / `status_projeto(projeto_id)`.
- `quem_nao_apontou(periodo)` / `apontamentos_abertos()`.
- `carga_equipe(periodo)` — sobrecarga/ociosidade por colaborador (horas + tasks).
- `ferias_e_conflitos(periodo)` — quem sai de férias, sobreposições (`vacations`).
- `tasks_travadas(dias)` — tasks em `in_review`/paradas há mais de N dias, ou `abandoned`.

### 6.2 SQL de leitura restrito (solução B / híbrido)

- `consultar_dados(sql)` — executa SQL **somente leitura**:
  - Conexão com **role read-only** do Postgres (impossível escrever, mesmo se tentasse).
  - **Allowlist** de tabelas (as descritas em `dominio.md`).
  - `LIMIT` forçado, `statement_timeout`, rejeição de múltiplos statements.
  - Rejeita qualquer verbo que não seja `SELECT`.
  - Para perguntas ad-hoc que as tools curadas não cobrem.

### 6.3 Escrita (propõem; NÃO executam)

Cada tool de escrita retorna uma **proposta estruturada** com preview do efeito, não uma
mutação. A execução real só acontece após aprovação (ver §8).

- `propor_criar_apontamento(...)`
- `propor_encerrar_apontamento(apontamento_id)`
- `propor_criar_task(...)`
- (demais ações de escrita seguem o mesmo padrão)

---

## 7. Segurança / anti-alucinação (camadas)

Nenhum LLM é 100% incapaz de errar no texto. A segurança **não depende do modelo
acertar** — a arquitetura garante que, mesmo se ele errar, não há como causar dano nem
apresentar dado falso como verdade.

1. **Modelo nunca é fonte da verdade.** Todo número vem de tool/query; o modelo só
   repassa o que a função retornou. Não há como inventar dados financeiros.
2. **Propor × executar.** Tools de escrita só propõem; código determinístico valida e
   executa.
3. **Confirmação com preview real.** Antes de executar, mostra exatamente o que muda
   ("encerrar apontamento do João, aberto desde 14h — confirma?"). Nada silencioso.
4. **Permissão na execução.** Tools rodam sob o RBAC do admin logado (`permissions.js`);
   o modelo não tem credencial própria.
5. **Escrita tipada, leitura SQL confinada.** Cada escrita é função específica com schema
   validado. SQL livre só para leitura, em role read-only + allowlist + limite + timeout.
6. **Auditoria e reversibilidade.** Tudo logado (quem, o quê, antes/depois) no Axiom;
   ações reversíveis quando possível (soft delete/undo).
7. **Guardas de execução.** Limite de iterações, timeout e teto de tokens — sem loop
   infinito nem gasto sem controle.
8. **Injeção de prompt.** Conteúdo vindo de dados é tratado como não-confiável, nunca como
   instrução. Admin-only reduz muito a superfície.

---

## 8. Fluxo de confirmação (human-in-the-loop)

1. Usuário pede uma ação ("encerra o apontamento aberto do João").
2. O agente chama uma tool `propor_*`, que retorna uma **proposta** com: descrição
   legível, dados exatos afetados e um `proposal_id`.
3. O laço pausa e o frontend renderiza a proposta com **Aprovar / Cancelar** e o preview.
4. Ao aprovar, o frontend chama um endpoint de execução com o `proposal_id`.
5. O backend **revalida** (permissão, estado atual, expiração da proposta) e só então
   executa a função de escrita real. Registra na auditoria.

Propostas são de vida curta e revalidadas na execução (o estado pode ter mudado entre
propor e aprovar).

---

## 9. Auditoria

- Cada ação (leitura sensível e toda escrita) gera registro estruturado: `user_id`,
  ferramenta, parâmetros, resultado, timestamp; para escritas, estado antes/depois.
- Reusa `logger.js` + Axiom (já configurado). Identificação por `user_id`, coerente com a
  política de privacidade atual dos logs.

---

## 10. Frontend (widget)

- Componente de chat React (Vite/Tailwind, Lucide), coerente com a identidade visual atual.
- Streaming de tokens (usar a infra de SSE existente ou stream direto do endpoint).
- Renderização de propostas de ação (preview + Aprovar/Cancelar).
- Acesso restrito a admin (reusa auth/JWT e checagem de papel).

---

## 11. Endpoints (API)

- `POST /agent/chat` — envia mensagem, recebe resposta em streaming (pode conter texto e/ou
  proposta de ação).
- `POST /agent/actions/:proposalId/execute` — executa uma proposta aprovada (revalida +
  audita).
- (Sessão/histórico de conversa: manter mínimo na Fase 1 — stateless por request, histórico
  no cliente; persistência é backlog.)

---

## 12. Mudanças de dados / infraestrutura

- **Role read-only do Postgres** para a tool de SQL (migration/secret novo).
- Possível tabela curta para **propostas pendentes** (ou assinatura/expiração sem persistir).
- Novos secrets no Fly: `AGENT_API_KEY`, `AGENT_MODEL`, `AGENT_PROVIDER_BASE_URL`, etc.
- Sem mudança nas tabelas de domínio existentes.

---

## 13. Tratamento de erros

- Falha de tool → retorna erro estruturado ao modelo (`is_error`), que ajusta a abordagem
  ou pede esclarecimento — nunca inventa resultado.
- Erros de LLM (rate limit, timeout, provedor fora) → mensagem clara ao usuário + retry
  com backoff; via OpenRouter, considerar fallback de modelo.
- SQL inválido/negado → recusado com motivo, sem vazar detalhes internos.

---

## 14. Testes

- Unidade: cada tool de leitura (com dados de fixture), validação de schema das tools de
  escrita, guardas (limite de iterações/timeout).
- Segurança: a tool de SQL rejeita não-`SELECT`, respeita allowlist/limite/timeout, role
  read-only não escreve.
- Fluxo de confirmação: proposta → revalidação → execução; expiração; mudança de estado.
- Auditoria: toda escrita gera registro.

---

## 15. Custo estimado (Fase 1)

- Admin-only, baixo volume, com arquivo de contexto cacheado: **faixa de R$ 30–100/mês** de
  LLM. Hospedagem incremental ~zero (roda na API/Fly existente).

---

## 16. Backlog (fases futuras)

- **Fase 2:** tarefas agendadas pelo ADM via conversa (agendador + tabela +
  **fila de aprovação** — automação nunca escreve sem humano no meio); Google Calendar
  (OAuth próprio); relatórios em PDF (Tigris); alertas proativos; provisão de bônus;
  leitura de briefings em PDF; memória de preferências; exportações.
- **Fase 3:** WhatsApp via **Evolution API** (self-hosted, não-oficial): recebe mensagem por
  webhook, identifica o admin pelo número e chama o **mesmo núcleo** deste design; resposta
  volta pelo endpoint de envio da Evolution. Inclui áudio→transcrição (Whisper/Gemini) e foto
  de nota→despesa (visão/OCR). Confirmação de escrita vira resposta/botão no WhatsApp.
