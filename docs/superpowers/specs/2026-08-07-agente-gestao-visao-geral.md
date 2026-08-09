# Visão Geral — Agente de Gestão do Office Timesheet

**Data:** 2026-08-07
**Status:** documento mestre para validação (antes de gerar os planos por fase)
**Origem:** brainstorming assistido (Claude Code)

> Este documento consolida **tudo** que foi conversado — a parte técnica e a
> não-técnica. Serve para validar a visão completa antes de detalhar os planos de
> implementação. O design técnico da Fase 1 está no arquivo irmão
> `2026-08-07-agente-gestao-fase1-design.md`.

> **Mudança de 2026-08-08 — acesso por papel.** A decisão original era **admin-only**.
> Passou a ser: **todos os papéis usam o agente**, e cada pessoa alcança por ele
> exatamente o que já alcançaria navegando o site. O detalhamento está no §2.1; os
> pontos afetados ao longo do documento estão marcados com a data. Nada disso foi
> implementado ainda — a versão admin-only está preservada no histórico do git
> (`a7d6de7`, `471fa7d`, `fb60b45`).

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
| **Usuários** | ~~Só admin/gestão~~ → **todos os papéis, com escopo por papel** *(2026-08-08)* | Todo mundo acessa o agente; cada um alcança por ele exatamente o que já alcançaria pelo site. Ver §2.1 |
| **Escopo** | Read **+** write | Além de responder, age: apontar, encerrar timer, criar task |
| **Canal inicial** | Site primeiro | Já há JWT e SSE; valida o "cérebro" sem custo/risco de WhatsApp |
| **WhatsApp (Fase 3)** | **Evolution API** (self-hosted, não-oficial), reusando o mesmo núcleo | Grátis e sob nosso controle; WhatsApp vira só um adaptador do agente do site |
| **Abordagem de dados** | Híbrido: tools curadas + SQL de leitura restrito **admin-only** *(2026-08-08)* | Segurança das tools + flexibilidade do SQL para perguntas ad-hoc. Allowlist de tabela não filtra linha nem coluna, então SQL livre não serve aos demais papéis |
| **Modelo** | Agnóstico via OpenRouter, padrão **DeepSeek V4 Pro** *(2026-08-08; era o Flash)* | Modelo único, sem roteamento. R$ 82/mês no esperado — a diferença para o Flash é R$ 55, que não paga a complexidade de rotear. O A/B inverte: tenta provar que o Flash basta para uma fatia. Ver §4.1 do design |
| **Privacidade** | Sem restrição (prioriza custo) | Usuário optou pelo mais barato mesmo com hospedagem na China |
| **Onde roda** | Dentro da API Express atual | Reusa DB, `permissions.js`, `jwt.js`, logger/Axiom; zero serviço novo |
| **Escrita** | Só com confirmação e preview do efeito | "Check antes de fazer" vira parte estrutural, não opcional |
| **Contexto** | `dominio/` cacheado, **fatiado por papel** *(2026-08-08)* | Menos alucinação, ir direto ao ponto, gastar menos token. Ver §6 |
| **Histórico** | Sessão server-side **em memória**, efêmera *(2026-08-08)* | Servidor dono do transcript (cliente não forja resultado de tool); funciona igual no WhatsApp; não força a decisão de retenção. Persistir "como o ChatGPT" fica para a Fase 2 |
| **Controle de gasto** | **Medir, não travar** *(2026-08-08)* | `usage` na linha de log + alertas no Axiom, que já existe. Sem tabela, sem bloqueio: era muita máquina para governar R$ 82/mês, e os guards por requisição já impedem runaway. Ver §19.1 do design |

### 2.1 Acesso por papel *(2026-08-08)*

**Invariante.** O agente alcança exatamente as linhas que a pessoa já alcançaria pelo
site — nem mais, nem menos —, mas pode cruzá-las e agregá-las de formas que nenhuma tela
oferece hoje. **Escrita segue a mesma regra:** se a rota já permite a ação para aquele
papel, o agente pode propor, com a confirmação do §8.

O que cada papel alcança hoje, conforme os guards das rotas:

| | admin | estagiário adm. | gestor de projetos | colaborador |
|---|---|---|---|---|
| Relatórios, dashboard, folha, bônus, custo | sim | não | não | não |
| Filas de aprovação (férias, despesa, apontamento) | sim | sim | não | não |
| Lista de pessoas | sim, **com** salário | sim, **sem** salário | não | não |
| Ao vivo (`/admin/live`) | sim | sim | não | não |
| Criar/editar projeto e templates | sim | não | sim | não |
| Projetos, tasks, clientes não-restritos | sim | sim | sim | sim |
| Próprio apontamento, férias, despesa, custo | sim | sim | sim | sim |

A matriz vem dos guards (`requireAdmin`, `requireApprover`, `requireOperationalAccess`,
`requireProjectManagement`) e das rotas lidas nesta revisão. Cada célula é reconfirmada
quando a tool correspondente for escrita; `expenses` foi mapeado pelo guard do endpoint,
não linha a linha.

**Como o escopo é aplicado — e onde está o risco.** Neste código o recorte não é por
linha, é **por endpoint com omissão de coluna**. A forma canônica está em
`src/routes/users.js:108`: o `GET /users` é `requireOperationalAccess`, então o estagiário
administrativo entra no endpoint e recebe **as mesmas linhas** que o admin — o SELECT é
que troca de lista de colunas conforme `canAccessMoney`, e aí somem `hourly_rate` e
`fixed_salary`.

Isso desloca o modo de falhar do agente. O risco não é permissão mal checada; é uma query
escrita para a tool do admin e reusada por outro papel, entregando a coluna de dinheiro
sem nenhum `if` errado no caminho. Silencioso, e nenhuma checagem dispara. A resposta
técnica — um `scope.js` que devolve linhas **e** colunas, catálogo de tools filtrado por
papel e teste de paridade — está nos §3.1, §8 e §18 do design da Fase 1.

**Mapa das colunas de dinheiro** (levantado nesta revisão):

| Coluna | Escreve | Lê |
|---|---|---|
| `users.hourly_rate`, `users.fixed_salary` | admin | o próprio dono (`/me`) e admin |
| `time_entries.cost_snapshot` | o sistema, ao encerrar o apontamento | o próprio dono (`/me`) e admin |
| `projects.sale_value` | **ninguém** (ver §4) | só admin, no `/admin/dashboard` |
| `bonuses.amount` | admin | admin |
| `expenses.amount` | quem cria a despesa | dono + fila de aprovação |

**Consequência de produto — o agente do colaborador é fino.** Dashboard, relatórios,
folha, custo de projeto e bônus são todos `requireAdmin` hoje; sob o invariante, a
"inteligência de gestão" do §4 é admin por construção. Para o colaborador sobram o próprio
trabalho e os dados abertos — e o valor dele está na **escrita**: apontar hora falando,
encerrar timer, pedir férias. Vale calibrar a expectativa do produto por isso.

---

## 3. As três fases

### Fase 1 — Núcleo reativo no site *(planejar primeiro)*

O cérebro do bot. Onde mora o risco e o valor. Detalhe técnico no arquivo de design.

- Agente agnóstico de modelo **e de canal** dentro da API Express.
- Tools de leitura curadas + SQL de leitura restrito.
- Tools de escrita **com confirmação**.
- **System prompt / regras de comportamento** (nunca inventar, confirmar escrita, pedir
  esclarecimento quando ambíguo, admitir quando não sabe).
- **Localização** (fuso do estúdio, R$, datas BR) — pra não errar "hoje/essa semana".
- **Histórico da conversa** — **decidido em 2026-08-08**: sessão server-side em memória,
  ~10 trocas, 30 min de inatividade, nada gravado em disco. O núcleo recebe o histórico
  como parâmetro e continua sem estado (§11 do design).
- **Conjunto de avaliação (eval set)** para medir alucinação e escolher o modelo por A/B.
- Segurança em camadas + auditoria + guardas de execução.
- Widget de chat no React com streaming.

### Fase 2 — Automação e integrações

> **Nota de 2026-08-08:** o acesso por papel se propaga para cá. As Fases 2 e 3 precisam
> decidir, cada uma no seu spec, **quais papéis** podem agendar rotinas e **quais** ganham o
> canal WhatsApp. Nada disso é decidido agora; fica registrado para não passar batido.

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
- **Conversas persistidas, "como o ChatGPT"** *(2026-08-08)*: lista de conversas anteriores,
  retomar, renomear, apagar. Não é só trocar o `Map` da Fase 1 por tabela — é funcionalidade
  visível, e traz junto retenção, expurgo e exclusão pelo usuário.
- **Receita e margem, se forem desejadas** *(2026-08-08)*: dependem de três decisões **de
  produto, não do agente** — caminho de escrita para `sale_value` (sob `canAccessMoney`, não
  sob gestão de projetos, senão o gestor escreve dinheiro que não lê), `project_id` em
  `expense_requests` com política para despesa sem projeto, e se salário fixo entra no
  custo. Com os dados no lugar, as tools entram sem tocar no núcleo.

### Fase 3 — Canal WhatsApp

- **Mesmo cérebro, novo canal.** O núcleo do agente é agnóstico de canal (ver §10): o
  WhatsApp é um **adaptador fino** sobre o mesmo agente do site. "Ser a mesma coisa que o
  site" = mesmo núcleo, canais diferentes; nenhuma lógica de agente é duplicada.
- **Gateway: Evolution API** (self-hosted, open-source). Roda em container, conecta a um
  número de WhatsApp via QR code (protocolo multi-device). Isso resolve a decisão que estava
  pendente — optamos pelo caminho **não-oficial** (grátis, self-hosted, sob nosso controle)
  em vez da API oficial da Meta.
- **Fluxo:** mensagem recebida no WhatsApp → Evolution dispara um **webhook** para a nossa
  API → a API identifica a pessoa pelo número → chama o **mesmo núcleo do agente** → a resposta
  volta pelo endpoint de envio da Evolution. O WhatsApp "chama o modelo diretamente" pelo
  mesmo caminho que o site.
- **Confirmação de escrita:** sem botão como no site, vira resposta (ex.: "responda *SIM*
  para confirmar") ou botões interativos, se suportado. O princípio de confirmação
  obrigatória se mantém idêntico ao do site.
- **Áudio**: o WhatsApp **não** entrega transcrição pronta ao bot — a Evolution dá o arquivo
  de áudio e nós transcrevemos (Whisper da OpenAI ou Gemini nativo). Português funciona bem.
- **Foto de nota fiscal → despesa**: modelo de visão lê a imagem, extrai campos, propõe a
  despesa (com confirmação).
- **Trade-off (ver §12):** a Evolution é não-oficial → contra os termos do WhatsApp, com
  risco de banimento do número. Aceitável para uso interno/admin; mitigar com um **número
  dedicado**, nunca o principal do estúdio.

---

## 4. Casos de uso (cardápio completo)

Aproveitando dados que já existem no banco. Marcado por fase.

> **Nota de 2026-08-08:** com o acesso por papel, tudo que hoje vive atrás de
> `requireAdmin` — esta seção de inteligência de gestão, relatórios, folha, bônus —
> permanece **admin-only** por força do invariante do §2.1. Os demais papéis usam o
> subconjunto que já lhes é visível.

**Inteligência de gestão** *(Fase 1)*
- ~~Margem/lucratividade por projeto (valor − custo de horas − despesas).~~ **Fora da
  Fase 1 (decidido em 2026-08-08).** Dos três termos da fórmula, só um funciona: o custo de
  horas. `projects.sale_value` é campo morto (nasce `0`, nenhum UPDATE existe) e
  `expense_requests` não tem `project_id`, então despesa não é atribuível a projeto. Entra
  no lugar **custo por projeto**, que é o termo íntegro. Detalhe e pré-requisitos no §8.1 do
  design.
- **Custo por projeto** *(entra no lugar da margem)* — soma de `cost_snapshot` por projeto.
  Rotulado como **"custo dos horistas"**: quem tem salário fixo aponta hora com custo zero
  (`users.js:80-81`), coisa que o próprio sistema já sinaliza como aviso em
  `reports.js:235`.
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

**Decisão (2026-08-08):** construir agnóstico (OpenRouter) e adotar o **DeepSeek V4 Pro**
como padrão, **modelo único**. No cenário esperado (2.400 perguntas/mês) isso dá R$ 82 contra
R$ 27 do Flash, R$ 77 do Gemini 3.1 Flash-Lite, R$ 156 do Gemini 3 Flash e R$ 230–500 do
Kimi K2.6 — fator de 20× entre as pontas.

**Roteamento (Flash para o simples, Pro para o profundo) foi considerado e adiado.** Três
razões: a diferença Flash↔Pro é R$ 55/mês, que não paga a complexidade; **o cache de prefixo
é por modelo**, então dividir o tráfego esfria os dois — e escalar no meio do laço faz a
pergunta custar Flash *mais* Pro, porque o segundo chega com cache frio e relê o prefixo; e é
otimização antes de medir. O A/B do §13 inverte de objetivo: em vez de provar que o Pro é
necessário, tenta provar que o **Flash basta** para uma fatia identificável. Se um dia
entrar, a forma preferida é um **botão no widget** ("resposta rápida" × "análise profunda"),
não um classificador — e o argumento real a favor é latência, não custo. Detalhe no §4.1 do
design.

Fontes: [DeepSeek Pricing](https://deepseek.ai/pricing) ·
[Moonshot/Kimi Pricing](https://benchlm.ai/moonshot/api-pricing) ·
[Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)

---

## 6. Arquivo de contexto de domínio (`dominio.md`)

Documento versionado que descreve o projeto para o agente — **fonte única** de schema,
glossário e allowlist. Reduz alucinação, guia o bot direto ao ponto e economiza token.

- **Schema anotado**: tabelas/colunas/relações permitidas (só as da allowlist).
- **Glossário de negócio**: "apontamento", "custo dos horistas", "estouro de orçamento de
  horas", "sobrecarga". *(2026-08-08: "margem" e "projeto no vermelho" saíram — dependem de
  receita, que não existe no banco. O glossário não define o que o agente não calcula.)*
- **Enums explicados**: status de task, tipos, papéis.
- **Joins canônicos / dicas de query** para perguntas comuns.
- **O que NÃO tocar.**
- Injetado no **prefixo cacheado** do prompt. Mantido em sincronia com as migrations.

**Mudança de 2026-08-08 — fatiado por papel.** O arquivo único vira um diretório
`dominio/`: um núcleo comum mais uma fatia por papel. O agente do colaborador não recebe
a descrição das tabelas e colunas que ele não alcança. Não é só higiene de segurança — é
o que evita o modelo tentar uma consulta impossível, falhar e responder "não posso",
queimando token e revelando o mapa. São quatro prefixos cacheados em vez de um; o
cache-hit continua valendo, agora por papel.

---

## 7. Segurança / anti-alucinação — as camadas

Nenhum LLM é 100% incapaz de errar no texto. A segurança **não depende do modelo acertar**:
mesmo que ele erre, não há como causar dano nem apresentar dado falso como verdade.

1. **Modelo nunca é a fonte da verdade.** Todo número vem de tool/query; ele só repassa.
2. **Propor × executar.** Escrita só é proposta; código determinístico valida e executa.
3. **Confirmação com preview real.** Mostra exatamente o que muda antes de executar.
4. **Permissão na execução.** Tools rodam sob o RBAC **de quem perguntou**
   (`permissions.js`) — *(2026-08-08: era "do admin")*; o modelo não tem credencial
   própria. Cada tool recebe o `profile` e monta a query pelo `scope.js`, que devolve
   linhas **e** colunas permitidas.
5. **Escrita tipada, leitura SQL confinada.** Cada escrita é função específica com schema
   validado; SQL livre só para leitura, em role read-only + allowlist + limite + timeout.
6. **Auditoria e reversibilidade.** Tudo logado (quem, o quê, antes/depois) no Axiom.
7. **Guardas de execução.** Limite de iterações, timeout e teto de tokens.
8. **Injeção de prompt.** Conteúdo de dados é tratado como não-confiável, nunca como
   instrução. **Mudança de 2026-08-08: a mitigação "admin-only reduz muito a superfície"
   caiu.** Com todos os papéis usando o agente, nome de projeto, título de task e
   comentário — texto que qualquer pessoa digita — passam a chegar ao contexto do agente
   de outra pessoa. Sobra só a separação dado × instrução, que agora precisa de caso
   próprio no eval set.

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

- **Núcleo agnóstico de canal:** o agente é um **serviço reutilizável**, não acoplado ao
  site. O site (Fase 1) e o WhatsApp via **Evolution API** (Fase 3) são apenas adaptadores
  que chamam o mesmo núcleo — mesmas tools, mesma segurança, mesmo fluxo de confirmação.
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

- **LLM:** ~R$ 30–100/mês na Fase 1 — **estimativa confirmada com os números reais
  (2026-08-08)**. Contexto: 10 funcionários, 2 a 5 usando de verdade. Com **DeepSeek V4
  Pro** (o padrão) e contexto cacheado, uma pergunta custa ~R$ 0,034; o cenário esperado dá
  **R$ 82** e o pesado, **R$ 226**. *(Registrou-se antes que a estimativa caducara com o
  acesso por papel; com os números na mão, ela se sustenta — o que multiplica custo é usuário
  pesado, e esse número saiu de 1–2 para 2–5.)* Detalhe da conta e comparação entre modelos
  no §19 do design.
- **Controle de gasto: medir, não travar.** O `usage` de cada chamada entra na linha de log e
  o Axiom — que já está de pé, com queries APL documentadas no README — dá consumo por
  pessoa e por dia. Alertas em **20M tokens/dia global**, **5M/dia por pessoa** (esses não
  dependem do modelo) e **R$ 160/mês** (esse depende, e é revisto quando o modelo mudar).
  Nada bloqueia ninguém: os guards por requisição já impedem runaway, e travar o acumulado
  exigiria tabela e contador persistente para governar uma conta de R$ 82. Ver §19.1.
- **WhatsApp (Fase 3):** ~R$ 0 de mensagens (Evolution é self-hosted, sem tarifa da Meta);
  custo só do container onde a Evolution roda (baixo).
- **Hospedagem:** incremental ~zero na Fase 1 (roda na API/Fly existente); na Fase 3, soma o
  container da Evolution.
- **Total realista (produto maduro, time pequeno):** faixa de R$ 100–400/mês. O maior
  "custo" da Fase 3 não é dinheiro, é operar a Evolution de forma estável e o risco de
  banimento do número.

---

## 12. Riscos e compliance

- **LGPD:** dados financeiros/pessoais vão para API de terceiros. Usuário optou por custo
  (DeepSeek/Kimi na China). Registrar essa decisão; Gemini/Vertex é a saída se mudar.
- **Canal WhatsApp:** a **Evolution API** é não-oficial (protocolo web/Baileys) — viola os
  termos do WhatsApp e pode levar a banimento do número. Aceitável para uso interno/admin;
  mitigar com um **número dedicado** (nunca o principal do estúdio) e monitorar a conexão.
- **Alucinação:** mitigada pela camada 1 (modelo nunca é fonte da verdade) + tools.
- **Ação indevida:** mitigada pela confirmação obrigatória + RBAC na execução.
- **Custo descontrolado:** mitigado pelos guardas por requisição (teto de
  tokens/iterações/timeout), que impedem o runaway. No acumulado há **alerta, não trava**
  *(2026-08-08, §19.1)* — risco aceito conscientemente: um disparo no fim de semana só é
  visto na segunda, com algumas dezenas de reais gastas.

---

## 13. O que falta validar / próximos passos

**Decisões da rodada de 2026-08-08** — todas fechadas

- [x] ~~Margem na Fase 1~~ — **decidido em 2026-08-08**: receita e margem saem da fase;
      entra custo por projeto (§4).
- [x] ~~Teto de gasto por usuário~~ — **decidido em 2026-08-08**: sem trava; consumo no log
      e alertas no Axiom (§11 e §19.1 do design).
- [x] ~~Escolha do modelo~~ — **decidido em 2026-08-08**: DeepSeek V4 Pro, modelo único,
      roteamento fora da Fase 1 (§5 e §4.1 do design).

**Nenhuma pendência bloqueia mais o plano de implementação da Fase 1.**
- [x] ~~Opção de histórico de conversa~~ — **decidido em 2026-08-08**: memória efêmera
      (§11 do design).

**Próximos passos**

- [x] Validar este documento mestre.
- [x] Revisar para acesso por papel (2026-08-08).
- [x] Aprovar o design técnico da Fase 1 (`...-fase1-design.md`) — **revisado em 2026-08-08**:
      âncoras de código reconferidas (todas batem) e três forks de implementação fechados —
      streaming direto do `POST /agent/chat` (§14), propostas em `Map` com TTL (§16) e
      primeira fatia em **esqueleto andante** (vertical fino ponta a ponta).
- [ ] Gerar o **plano de implementação da Fase 1** (skill writing-plans) — *em andamento*.
- [ ] Fases 2 e 3 ganham spec + plano próprios quando chegarmos nelas (evitar planejar
      cedo demais — dependem do aprendizado do núcleo).
- [ ] Confirmar linha a linha o recorte de `expenses`, mapeado só pelo guard do endpoint
      (§2.1), quando a tool correspondente for escrita.
