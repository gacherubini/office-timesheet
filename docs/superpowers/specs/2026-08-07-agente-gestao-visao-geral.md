# Visão Geral — Agente de Gestão do Office Timesheet

**Data:** 2026-08-07
**Status:** documento mestre para validação (antes de gerar os planos por fase)
**Origem:** brainstorming assistido (Claude Code)

> Este documento consolida **tudo** que foi conversado — a parte técnica e a
> não-técnica. Serve para validar a visão completa antes de detalhar os planos de
> implementação. O design técnico da Fase 1 está no arquivo irmão
> `2026-08-07-agente-gestao-fase1-design.md`.

---

## 1. O que é o produto

Um **agente de gestão** conversacional embutido no Office Timesheet. Ele:

- **Consulta** os dados do sistema em linguagem natural (projetos, tasks, apontamentos,
  financeiro, pessoas).
- **Executa ações** no sistema — sempre com confirmação humana.
- **Cresce em fases**: começa reativo no site e evolui até automação agendada, Google
  Calendar, relatórios e WhatsApp.

O agente é, na essência, um tradutor de linguagem natural → consultas/ações no Postgres,
respondendo em português.

---

## 2. Decisões principais (travadas)

| Tema | Decisão | Motivo |
|---|---|---|
| **Usuários** | Só admin/gestão | Casos de maior valor (faturamento, equipe) e controle de acesso mais simples |
| **Escopo** | Read **+** write | Além de responder, age: apontar, encerrar timer, criar task |
| **Canal inicial** | Site primeiro | Já há JWT e SSE; valida o "cérebro" sem custo/risco de WhatsApp |
| **Abordagem de dados** | Híbrido: tools curadas + SQL de leitura restrito | Segurança das tools + flexibilidade do SQL para perguntas ad-hoc |
| **Modelo** | Agnóstico via OpenRouter, padrão **DeepSeek V4 Flash** | O mais barato; trocável por Kimi/Gemini em 1 linha; decisão final por A/B |
| **Privacidade** | Sem restrição (prioriza custo) | Usuário optou pelo mais barato mesmo com hospedagem na China |
| **Onde roda** | Dentro da API Express atual | Reusa DB, `permissions.js`, `jwt.js`, logger/Axiom; zero serviço novo |
| **Escrita** | Só com confirmação e preview do efeito | "Check antes de fazer" vira parte estrutural, não opcional |
| **Contexto** | Arquivo `dominio.md` cacheado | Menos alucinação, ir direto ao ponto, gastar menos token |

---

## 3. As três fases

### Fase 1 — Núcleo reativo no site *(planejar primeiro)*

O cérebro do bot. Onde mora o risco e o valor. Detalhe técnico no arquivo de design.

- Agente agnóstico de modelo dentro da API Express.
- Tools de leitura curadas + SQL de leitura restrito.
- Tools de escrita **com confirmação**.
- Segurança em camadas + auditoria + guardas de execução.
- Widget de chat no React com streaming.

### Fase 2 — Automação e integrações

- **Tarefas agendadas configuráveis pelo ADM**: o admin conversa com o bot ("toda terça,
  me traz X") e o próprio bot cria a rotina. **Tensão importante:** no disparo não há
  ninguém para confirmar → tarefa agendada só faz coisa segura sozinha (relatório, alerta,
  leitura); se precisar escrever, **enfileira uma proposta** para aprovação posterior. Só no
  site.
- **Google Calendar**: agendar reuniões (OAuth próprio, projeto no Google Cloud).
- **Relatórios**: geração a partir do que o bot descobrir → markdown no chat, depois PDF no
  Tigris.
- **Alertas proativos**: "apontamento aberto há 12h", "3 projetos no vermelho".
- Provisão de bônus, leitura de briefings em PDF, memória de preferências, exportações.

### Fase 3 — Canal WhatsApp

- Mesmo cérebro, novo canal.
- **Áudio**: o WhatsApp **não** entrega transcrição pronta ao bot — a API dá o arquivo de
  áudio e nós transcrevemos (Whisper da OpenAI ou Gemini nativo). Português funciona bem.
- **Foto de nota fiscal → despesa**: modelo de visão lê a imagem, extrai campos, propõe a
  despesa (com confirmação).
- Decisão pendente: **API oficial da Meta** (estável, legal, exige verificação de negócio)
  vs. **biblioteca não-oficial** (grátis, mas viola termos e risco de banimento).

---

## 4. Casos de uso (cardápio completo)

Aproveitando dados que já existem no banco. Marcado por fase.

**Inteligência de gestão** *(Fase 1)*
- Margem/lucratividade por projeto (valor − custo de horas − despesas).
- Projeção de estouro de orçamento de horas.
- Simulação de performance (tabela `performance_simulations`).
- Provisão de bônus *(Fase 2)*.

**Gestão de pessoas** *(Fase 1)*
- Carga da equipe: quem está sobrecarregado / ocioso.
- Férias e conflitos/sobreposições (`vacations`).
- Presença/ausências (`presences`), aniversariantes (`user_calendars`).

**Operacional / tasks** *(Fase 1)*
- Tasks travadas: em `in_review` há +N dias ou `abandoned`.
- Andamento de projeto: o que mudou na semana (comentários, tasks, anexos).

**Proatividade** *(Fase 2)*
- Alertas automáticos, digest agendado, detecção de anomalia.
- Tudo isso configurável pelo ADM via conversa (ver Fase 2).

**Documentos e saídas** *(Fase 2)*
- Ler briefing em PDF e responder (`project_briefing_documents`).
- Exportar relatório em PDF/CSV; gerar escopo a partir de `project_templates`.

**Entrada rica** *(Fase 3)*
- Áudio → apontamento; foto de nota → despesa (OCR/visão).

**Governança** *(Fase 1, parte do núcleo)*
- Trilha de auditoria de tudo que o bot faz.
- Memória de preferências (opcional/leve).

---

## 5. Modelos de IA — comparação e escolha

A arquitetura é **agnóstica**: trocar de modelo é config. O modelo importa menos que a
qualidade das tools. Preços em **USD por 1M de tokens** (pesquisa de ago/2026).

| Modelo | Input | Output | Agente? | Hospedagem |
|---|---|---|---|---|
| **DeepSeek V4 Flash** | $0.14 | $0.28 | Sim (OpenAI+Anthropic compat) | China |
| DeepSeek V4 Pro | $0.435 | $0.87 | Sim, mais forte | China |
| **Kimi K2.6** | $0.95 | $4.00 | **Excelente — feito p/ agentic** | China |
| Kimi K2.5 | $0.60 | $3.00 | Ótimo, tier valor | China |
| Kimi K3 | $3.00 | $15.00 | Top, mas caro | China |
| **Gemini 3 Flash** | $0.50 | $3.00 | Sim, function calling nativo | Google |
| **Gemini 3.1 Flash-Lite** | $0.25 | $1.50 | Sim, mais barato | Google |
| *(Haiku 4.5, referência)* | *$1.00* | *$5.00* | — | — |

- Todos são **bem mais baratos que o Haiku** (que o usuário dispensou).
- **Cache-hit** é a grande alavanca: no DeepSeek, input em cache custa ~$0.0028/1M — por
  isso o arquivo de contexto no prefixo cacheado sai quase de graça após a 1ª chamada.
- DeepSeek/Kimi são hospedados na **China** (nota de LGPD registrada; usuário optou por
  custo). Gemini via Vertex teria a melhor governança, caso mude de ideia.

**Decisão:** construir agnóstico (OpenRouter), começar com **DeepSeek V4 Flash**, decidir o
final por A/B na fase de teste.

Fontes: [DeepSeek Pricing](https://deepseek.ai/pricing) ·
[Moonshot/Kimi Pricing](https://benchlm.ai/moonshot/api-pricing) ·
[Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)

---

## 6. Arquivo de contexto de domínio (`dominio.md`)

Documento versionado que descreve o projeto para o agente — **fonte única** de schema,
glossário e allowlist. Reduz alucinação, guia o bot direto ao ponto e economiza token.

- **Schema anotado**: tabelas/colunas/relações permitidas (só as da allowlist).
- **Glossário de negócio**: "apontamento", "margem", "projeto no vermelho", "sobrecarga".
- **Enums explicados**: status de task, tipos, papéis.
- **Joins canônicos / dicas de query** para perguntas comuns.
- **O que NÃO tocar.**
- Injetado no **prefixo cacheado** do prompt. Mantido em sincronia com as migrations.

---

## 7. Segurança / anti-alucinação — as camadas

Nenhum LLM é 100% incapaz de errar no texto. A segurança **não depende do modelo acertar**:
mesmo que ele erre, não há como causar dano nem apresentar dado falso como verdade.

1. **Modelo nunca é a fonte da verdade.** Todo número vem de tool/query; ele só repassa.
2. **Propor × executar.** Escrita só é proposta; código determinístico valida e executa.
3. **Confirmação com preview real.** Mostra exatamente o que muda antes de executar.
4. **Permissão na execução.** Tools rodam sob o RBAC do admin (`permissions.js`); o modelo
   não tem credencial própria.
5. **Escrita tipada, leitura SQL confinada.** Cada escrita é função específica com schema
   validado; SQL livre só para leitura, em role read-only + allowlist + limite + timeout.
6. **Auditoria e reversibilidade.** Tudo logado (quem, o quê, antes/depois) no Axiom.
7. **Guardas de execução.** Limite de iterações, timeout e teto de tokens.
8. **Injeção de prompt.** Conteúdo de dados é tratado como não-confiável, nunca como
   instrução. Admin-only reduz muito a superfície.

O "check antes de fazer" que o usuário pediu é exatamente a camada 3 — obrigatória, não
opcional.

---

## 8. Fluxo de confirmação (human-in-the-loop)

1. Usuário pede a ação.
2. Agente chama uma tool `propor_*` → retorna proposta (descrição legível + dados afetados +
   `proposal_id`).
3. O laço pausa; o frontend mostra a proposta com **Aprovar / Cancelar** + preview.
4. Ao aprovar, o frontend chama o endpoint de execução.
5. O backend **revalida** (permissão, estado atual, expiração) e só então executa e audita.

---

## 9. Auditoria

Toda escrita (e leitura sensível) gera registro estruturado: `user_id`, ferramenta,
parâmetros, resultado e — para escritas — estado antes/depois. Reusa `logger.js` + Axiom,
coerente com a política de privacidade atual (identificação por `user_id`).

---

## 10. Arquitetura técnica (resumo)

- **Frontend (React/Vite):** widget de chat com streaming + UI de confirmação.
- **API Express (`src/`):** módulo do agente — `routes/agent.js`, `lib/agent/loop.js`,
  `lib/agent/client.js` (cliente OpenAI-compatible), `lib/agent/tools/` (read/sql/write),
  `lib/agent/context/dominio.md`, `lib/agent/guards.js`, `lib/agent/audit.js`.
- **Postgres:** usuário app (leitura + escrita curadas) e **role read-only** dedicado (SQL
  ad-hoc, allowlist).
- **Config por ambiente:** `AGENT_MODEL`, `AGENT_API_KEY`, `AGENT_PROVIDER_BASE_URL`,
  `AGENT_MAX_ITERATIONS`, `AGENT_MAX_TOKENS`, `AGENT_TIMEOUT_MS`.

---

## 11. Custo (não-técnico)

- **LLM:** ~R$ 30–100/mês na Fase 1 (admin-only, baixo volume, contexto cacheado).
- **WhatsApp (Fase 3):** de ~R$ 0 (bot inbound, conversas de serviço) a ~R$ 100/mês.
- **Hospedagem:** incremental ~zero (roda na API/Fly existente).
- **Total realista (produto maduro, time pequeno):** faixa de R$ 100–400/mês. O maior
  "custo" não é dinheiro, é a decisão do canal WhatsApp (oficial vs. não-oficial).

---

## 12. Riscos e compliance

- **LGPD:** dados financeiros/pessoais vão para API de terceiros. Usuário optou por custo
  (DeepSeek/Kimi na China). Registrar essa decisão; Gemini/Vertex é a saída se mudar.
- **Canal WhatsApp:** biblioteca não-oficial viola termos e pode levar a banimento — ok para
  protótipo interno, arriscado para produção.
- **Alucinação:** mitigada pela camada 1 (modelo nunca é fonte da verdade) + tools.
- **Ação indevida:** mitigada pela confirmação obrigatória + RBAC na execução.
- **Custo descontrolado:** mitigado pelos guardas (teto de tokens/iterações/timeout).

---

## 13. O que falta validar / próximos passos

- [ ] Validar este documento mestre (é o objetivo desta rodada).
- [ ] Aprovar o design técnico da Fase 1 (`...-fase1-design.md`).
- [ ] Gerar o **plano de implementação da Fase 1** (skill writing-plans).
- [ ] Fases 2 e 3 ganham spec + plano próprios quando chegarmos nelas (evitar planejar
      cedo demais — dependem do aprendizado do núcleo).
- [ ] Commit dos documentos quando você autorizar (ainda não commitado).
