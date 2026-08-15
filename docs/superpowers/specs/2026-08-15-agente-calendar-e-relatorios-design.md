# Design — Agente: leitura de Calendar e relatórios em arquivo

**Data:** 2026-08-15
**Status:** aprovado no brainstorming; a implementar (test-first)
**Origem:** conversa de brainstorming (Grok)
**Fase:** primeira fatia da Fase 2 da `2026-08-07-agente-gestao-visao-geral.md`.
Não é a Fase 2 inteira.

> O agente passa a **ler a agenda** que a pessoa já ligou no perfil (iCal,
> paridade com a tela Agenda) e o **admin** passa a **baixar um arquivo**
> (CSV / XLSX / PDF / Markdown) montado a partir das tools de leitura. O
> modelo escolhe *o que entra*; os números do arquivo nunca passam pela
> boca dele.

Revê dois itens da visão geral (§3, Fase 2):

- **Calendar neste corte** = informação (leitura do iCal já existente).
  *Agendar* reunião com OAuth/Google Cloud fica no backlog.
- **Relatório neste corte** = arquivo temporário no chat, sem Tigris e
  sem e-mail. Markdown no chat sem arquivo continua o que a Fase 1 já faz.

---

## 1. Decisões travadas

| Tema | Decisão | Motivo |
|---|---|---|
| **Escopo do spec** | Calendar leitura + relatório em arquivo. Só isso. | A Fase 2 no papel mistura rotinas, alertas, conversas persistidas, OAuth e WhatsApp — cada um vira spec depois |
| **Calendar: alcance** | Paridade com o site: própria agenda Google + escritório (`OFFICE_ICS_URL`) + feriados | Invariante do §2.1 da visão. Admin **não** lê o Google de outra pessoa |
| **Calendar: escrita** | Fora | "Informação", não agendar. Sem OAuth |
| **Relatório: quem** | Só admin | Igual a `/admin/reports/*` |
| **Relatório: conteúdo** | Livre a partir da conversa: o modelo lista *fontes* (tools + params); o servidor **reexecuta** e renderiza | Modelo nunca é fonte da verdade |
| **Formatos** | `md`, `csv`, `xlsx`, `pdf` | Pedido explícito; CSV não substitui XLSX |
| **Arquivo** | Temporário em memória. Browser baixa. Servidor **não** persiste (sem Tigris, sem disco, sem e-mail) | Escolha de produto |
| **TTL / redownload** | 5 min, **vários** GETs no intervalo | Proposta de escrita é uso único porque executar 2× é perigoso; baixar 2× não é |
| **Teto do arquivo** | **10 MB** | Trava de segurança; o caso real (6 fontes × 500 linhas) cabe folgado |
| **Confirmação** | Nenhuma. Não é escrita | Sem proposta / Aprovar |

---

## 2. Arquitetura

Dois acréscimos no módulo do agente. Sem serviço novo, sem tabela, sem OAuth.

```
POST /agent/chat  (SSE, JWT, como hoje)
        │
        ▼
┌─────────────────────────────────────────────┐
│  loop.js + registry                         │
│                                             │
│  agenda_do_periodo     (todos os papéis)    │
│       └── lib/calendar/events.js            │
│           (extraído de routes/calendar.js)  │
│                                             │
│  gerar_relatorio       (admin)              │
│       ├── reexecuta tools de leitura        │
│       ├── renderer (md / csv / xlsx / pdf)  │
│       └── downloads.remember(buffer)        │
│                                             │
│  emit { type: 'file', token, filename,      │
│         mime, bytes }                       │
└───────────────┬─────────────────────────────┘
                │
                ▼
        GET /agent/downloads/:token
        (JWT + dono; vários GETs; some em 5 min)
```

**Não muda:** sessão, confirmação de escrita, `scope.js`, SQL admin,
kill switch, rate limit do chat.

---

## 3. Calendar — `agenda_do_periodo`

### 3.1 Extração

A lógica que hoje vive em `src/routes/calendar.js` (validação de URL,
anti-SSRF, fetch iCal, cache 15 min, parse, feriados, `OFFICE_ICS_URL`,
`eventsInRange`) sobe para **`src/lib/calendar/events.js`**.

A rota `GET /me/calendar/events` vira um wrapper fino da mesma função
(`listEventsForUser(userId, start, end)` → `{ events, calendar_error }`).
`isValidIcsUrl` e `isPrivateOrReservedIp` **continuam reexportados** por
`routes/calendar.js` para o teste de SSRF existente não quebrar no meio
da extração; o teste pode passar a importar do lib quando for tocado.

### 3.2 Tool

| | |
|---|---|
| Nome | `agenda_do_periodo` |
| kind | `read` |
| roles | `admin`, `administrative_intern`, `project_manager`, `employee` |
| espelha | `GET /me/calendar/events` |

**Parâmetros** — um modo ou o outro, nunca os dois (se vierem juntos, recusa):

| Modo | Campos | Default |
|---|---|---|
| Nomeado | `periodo`: `hoje` · `amanha` · `semana` · `mes` | `hoje` |
| Explícito | `inicio` + `fim` (`YYYY-MM-DD`, inclusivos, fuso do estúdio) | — |

`amanha` existe **só nesta tool**. Não entra em `resolvePeriodo` global
(as outras tools continuam com `hoje` / `semana` / `mes`). A tool resolve
`amanha` localmente no fuso `America/Sao_Paulo` e chama `listEventsForUser`.

Intervalo máximo: **31 dias** (inclusivo). Acima disso a tool lança erro
pedindo um recorte. `inicio` sem `fim` (ou o contrário) recusa. Sem
parâmetro de pessoa — não há como pedir a agenda de outra gente.

Interpretação de `inicio`/`fim` ao chamar `listEventsForUser`: a mesma
da rota atual (`start` às 00:00 e `end` às 23:59:59 no construtor que a
rota já usa), para a paridade ser bit-a-bit nos eventos.

### 3.3 Retorno

```json
{
  "conectado": true,
  "calendar_error": false,
  "count": 3,
  "data": [
    {
      "titulo": "Reunião cliente",
      "inicio": "2026-08-16T13:00:00.000Z",
      "fim": "2026-08-16T14:00:00.000Z",
      "dia_todo": false,
      "local": "Meet",
      "fonte": "google"
    }
  ]
}
```

Mapeamento a partir do evento da rota: `title→titulo`, `start→inicio`,
`end→fim`, `all_day→dia_todo`, `location→local`, `source→fonte`.

- Sem `id` interno. Sem `description` do evento (token e privacidade).
- `conectado` = existe linha em `user_calendars` para essa pessoa
  (independente do fetch). `false` = iCal pessoal não ligado. Escritório
  e feriados **ainda vêm**. O agente diz para ligar em Perfil; não inventa
  compromisso.
- `calendar_error: true` = o feed do Google falhou (mesmo recado da Agenda).
  Pode vir junto de `conectado: true`.

### 3.4 Prompt

Em `dominio/core.md` (todos os papéis):

- Agenda = sua Google (se ligada) + escritório + feriados.
- Pedir a agenda de outra pessoa → recusar. Sem citar mecanismo
  (“não tenho a agenda dela; posso te trazer a sua ou a do escritório”).

---

## 4. Relatório — `gerar_relatorio`

### 4.1 Tool

| | |
|---|---|
| Nome | `gerar_relatorio` |
| kind | `read` (não é escrita; sem proposta) |
| roles | `admin` |
| espelha | `null` (não há endpoint de “gerar arquivo”; entra no `semEspelho` da paridade, como `consultar_dados`) |

**Parâmetros:**

```json
{
  "titulo": "Semana 11/08 — ponto e custo",
  "formato": "xlsx",
  "fontes": [
    { "tool": "quem_nao_apontou", "params": { "periodo": "semana" }, "titulo": "Quem não apontou" }
  ]
}
```

- `titulo` (string, obrigatório)
- `formato`: `md` · `csv` · `xlsx` · `pdf` (obrigatório)
- `fontes`: array de 1–6 itens
  - `tool`: nome da função (string)
  - `params`: objeto passado **como está** para `tool.run(profile, params)`
  - `titulo` (opcional): título da seção / nome da aba. Sem ele, usa o
    nome da tool com underscores virados espaço.

### 4.2 Fontes permitidas

Qualquer tool `kind === 'read'` **exceto** o próprio `gerar_relatorio`.
Inclui `consultar_dados` e `agenda_do_periodo`. Exclui escrita e
`registrar_pedido_nao_atendido`.

Para não criar import circular (`registry` → `gerarRelatorio` →
`registry`), o array `TODAS` sai para **`src/lib/agent/tools/catalog.js`**.
`registry.js` e `gerar_relatorio` importam o catálogo. Tool nova de
leitura entra **só no catálogo** e automaticamente vira fonte.

Validação, nesta ordem:

1. `formato` conhecido.
2. `fontes.length` entre 1 e 6.
3. Cada `tool` existe no catálogo, `kind === 'read'`, `roles` inclui
   `admin`, e não é `gerar_relatorio`.
4. Reexecuta `tool.run(profile, params)` com o `profile` de quem
   perguntou (o admin).

Uma fonte lança → essa seção no arquivo vira um aviso com a mensagem;
as outras seguem. **Todas** falham → não gera arquivo; a tool lança
erro para o modelo.

Cada seção no arquivo corta em **500 linhas**. Se a tool devolveu mais,
anota “mostrando 500 de N”. (`consultar_dados` já corta em 200 pelo
guard; o 500 é o teto do renderer.)

### 4.3 O modelo nunca manda a tabela

Não existe parâmetro `linhas` / `dados`. Se o modelo inventar número
no texto do chat, o arquivo não leva isso. Os bytes saem só do
`tool.run` reexecutado.

### 4.4 Renderers — `src/lib/agent/reports/`

| Formato | Arquivo | Como | Dependência |
|---|---|---|---|
| `xlsx` | `.xlsx` | Uma aba por fonte. Nome da aba: título sanitizado, máx. 31 chars, sufixo se colidir | `exceljs` (nova, em `src/package.json`) |
| `csv` | `.csv` | Um arquivo; seções uma embaixo da outra, título no meio, células escapadas | nenhuma |
| `pdf` | `.pdf` | A4, Helvetica (acentos PT-BR no WinAnsi), título + data/hora no fuso do estúdio, tabelas. Sem capa, sem Chrome, sem logo | `pdfkit` (nova) |
| `md` | `.md` | Tabelas Markdown. Mesmo caminho de download — o modelo **não** reescreve a tabela no chat | nenhuma |

Colunas = chaves do primeiro item quando `result.data` é um array de
objetos. Se `data` for um objeto único, a seção vira pares chave/valor.
Se for outro formato, a seção vira uma célula com o JSON.

Markdown **no chat sem arquivo** continua a Fase 1: o admin pergunta e
o agente monta tabela na resposta. `gerar_relatorio` é só quando ele
pede um arquivo.

### 4.5 Nome do arquivo

Slug do `titulo`: NFD, minúsculas, não-alfanuméricos → hífen, colapsa,
máx. 60 chars + `-YYYY-MM-DD` (hoje no fuso SP) + extensão.

Ex.: `semana-11-08-ponto-e-custo-2026-08-15.xlsx`.

### 4.6 Retorno ao modelo (sem bytes)

```json
{
  "ok": true,
  "filename": "semana-11-08-ponto-e-custo-2026-08-15.xlsx",
  "formato": "xlsx",
  "secoes": [
    { "fonte": "quem_nao_apontou", "linhas": 4 },
    { "fonte": "custo_por_projeto", "linhas": 12 }
  ]
}
```

Fonte que falhou: `{ "fonte": "…", "erro": "…" }` e não entra em
`linhas`. O buffer **não** vai para `messages` (token e o modelo não
“corrigem” o Excel).

### 4.7 Lado `arquivo` e o laço

`run` devolve o formato usual das tools de leitura **mais** um campo
que o laço descasca:

```js
{
  data: { ok, filename, formato, secoes },
  count: secoes.length,
  arquivo: { token, filename, mime, bytes } // bytes = tamanho, não o buffer
}
```

Em `loop.js`, no ramo `kind === 'read'`, depois do `run` bem-sucedido:

1. Se `result.arquivo` existe, `emit({ type: 'file', token, filename, mime, bytes })`.
2. `messages.push` com `truncarResultado(JSON.stringify(result.data))` —
   **sem** `arquivo`.
3. `auditAgentRead` como as outras leituras.

MIME:

| formato | mime |
|---|---|
| `csv` | `text/csv` |
| `xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `pdf` | `application/pdf` |
| `md` | `text/markdown` |

Se o buffer passar de **10 MB**, a tool **não** chama `remember` e
lança erro (“arquivo grande demais; refine as fontes ou o período”).

### 4.8 Prompt (fatia admin)

Em `dominio/admin.md`:

- Pediram arquivo / Excel / PDF / CSV / “me exporta” → chamar
  `gerar_relatorio`. Não colar o arquivo no texto.
- Escolher as fontes e os params; não inventar linha.
- Não oferecer relatório a quem não é admin (a tool nem aparece para
  os outros; a regra de recusa sem mecanismo já cobre).

---

## 5. Download efêmero

### 5.1 `src/lib/agent/downloads.js`

Mesmo espírito de `proposals.js`: `Map` em memória, UUID, dono, TTL,
expurgo preguiçoso na próxima criação. Sem `setInterval`.

| | |
|---|---|
| Chave | UUID |
| Valor | `{ userId, buffer, filename, mime, criadoEm }` |
| TTL | 5 minutos (`DOWNLOAD_TTL_MS`) |
| Teto | 10 MB no `remember` (recusa antes de gravar) |
| Uso | **vários** `get` enquanto o TTL valer — **não** apaga no GET |

API:

- `remember({ profile, buffer, filename, mime, now })` → `{ token }`
- `get(token, profile, now)` → o registro ou `null` (sumiu, expirou,
  ou `userId`/`role` não batem — mesmo critério de `takeProposal`:
  dono **e** papel, para um rebaixamento entre gerar e baixar não
  entregar o arquivo)
- `pendingCount()` para teste

Reiniciar a API, outra máquina Fly, ou recarregar a página depois do
TTL = arquivo sumiu. É o mesmo buraco de sessão/proposta; não se
resolve neste spec.

### 5.2 `GET /agent/downloads/:token`

Em `routes/agent.js`, atrás de **`requireAuth` só**. Sem kill switch e
sem exigir `AGENT_API_KEY`: o arquivo já foi gerado; a chave do modelo
não entra neste GET.

- `get` ok → `200`, `Content-Type` do mime, `Content-Disposition:
  attachment; filename="…"`, corpo = buffer.
- Caso contrário → `404` `{ error: 'arquivo expirado ou indisponível' }`.
  Sem distinguir “não existe” / “não é seu” / “expirou”.

O `<a href>` não leva JWT. O chat faz `fetch` com Bearer, vira `blob`
e dispara o download (`URL.createObjectURL` + `<a download>`).

Helper no front: `downloadAgentFile(token)` em `web/src/lib/agentClient.js`.

### 5.3 UI — `AssistentePage`

Novo ramo no handler SSE, no mesmo espírito de `proposal`:

```js
if (e.type === 'file') {
  // anexa { token, filename, mime, bytes } na bolha do assistente
}
```

A bolha ganha um botão **Baixar `filename`**. Sem tela nova, sem preview.

- Clique ok → `downloadAgentFile`.
- `404` (TTL, reload tarde, outro browser) → texto na bolha:
  “esse arquivo expirou, pede de novo”.
- A sessão local (`agentSession`) **persiste** `{ filename, token, mime }`
  para o botão reaparecer; o 404 cobre o servidor que já esqueceu.

### 5.4 Auditoria

Log estruturado no momento do `remember`:

```
evt: 'agent_report_generated'
user_id, formato, fontes: [nomes], bytes, filename
```

Sem o conteúdo do arquivo. Sem tabela nova.

---

## 6. Erros visíveis

Português, sem jargão interno (SQL, tool, token, Map).

| Situação | O que acontece |
|---|---|
| Agenda Google não ligada | `conectado: false`. Agente manda ligar em Perfil. Escritório e feriados ainda aparecem |
| Feed do Google falhou | `calendar_error: true`, mesmo recado da Agenda |
| Pedir agenda de outra pessoa | Sem parâmetro. Prompt recusa sem explicar o recorte |
| Período > 31 dias, `periodo` + `inicio` juntos, ou `inicio`/`fim` incompleto | Tool recusa; pede um recorte |
| Não-admin pede arquivo | Tool fora do catálogo. Recusa sem mecanismo |
| Fonte desconhecida / escrita / recursão | Recusa essa fonte (ou a tool inteira, se for a única) |
| Uma fonte quebra | Seção vira aviso; as outras saem |
| Todas as fontes quebram, ou arquivo > 10 MB | Sem arquivo; agente pede para refinar |
| Token expirado / outro usuário / sumiu | `404` genérico |

---

## 7. Segurança

- Calendar: só `profile.id`. URL do iCal continua cifrada. SSRF continua
  na função extraída (allowlist de host Google, sem seguir redirect,
  bloqueio de IP privado/metadata).
- Relatório: só admin. Cada fonte reexecuta com o `profile` de quem
  perguntou e o guard que a tool já tem. `consultar_dados` **não** ganha
  poder — mesmo parser, allowlist, LIMIT, role read-only.
- Download: JWT + dono + papel. UUID não adivinhável. TTL 5 min.
  Buffer nunca vai a disco, Tigris ou prompt.
- Evento de Calendar e linha de relatório continuam **dado**, não
  instrução (mesma regra de anexo / comentário).
- Recusa não descreve o mecanismo (regra já existente no `prompt.js`).

---

## 8. Testes

Test-first. Estilo das suítes do agente.

### 8.1 Unitário

- **`downloads.js`**: cria e `get` do dono; outro usuário → `null`;
  papel rebaixado → `null`; TTL estourado → `null`; teto 10 MB recusa;
  segundo `get` no TTL ainda funciona; `pendingCount` após expurgo.
- **Renderers**: fixture de 2 fontes × 2 linhas gera os 4 formatos.
  MD/CSV: assert de substring nas células. XLSX: reler com `exceljs`.
  PDF: extrair texto com o `pdf-parse` que já está no projeto e achar
  as células. Uma fonte com erro vira aviso e a outra entra.
- **`gerar_relatorio`**: recusa fonte escrita / inexistente / o próprio
  nome; recusa 0 e 7 fontes; números no arquivo = retorno da tool
  reexecutada (um stub que devolve `{ data: [...] }`), **não** um
  campo que o modelo tenha tentado passar; arquivo > 10 MB recusa.
- **`agenda_do_periodo`**: `hoje` / `amanha` / `semana` / `mes` resolvem
  para um intervalo ≤ 31 dias; `inicio`+`fim` > 31 dias recusa;
  `periodo` e `inicio` juntos recusam; sem parâmetro de pessoa no schema.
- **SSRF**: o teste existente continua verde após a extração.

### 8.2 Integração

- **Paridade Calendar**: para o mesmo usuário e o mesmo `inicio`/`fim`,
  o `data` da tool (campos mapeados de volta) é o mesmo `events` de
  `GET /me/calendar/events`. Os 4 papéis entram em `paridadePapel`
  (`espelha: 'GET /me/calendar/events'`).
- **Paridade relatório**: `gerar_relatorio` **não** está no registry de
  intern / gestor / colaborador; admin sim. `espelha: null` → entra no
  `semEspelho` de `paridadePapel.test.js` (junto com `consultar_dados`
  e `registrar_pedido_nao_atendido`).
- **`GET /agent/downloads/:token`**: 401 sem JWT; 404 de outro user;
  200 do dono com `Content-Disposition` e o buffer.
- **Stream**: um turno com `gerar_relatorio` (renderer/fonte stubados
  se o iCal atrapalhar) emite um evento `file` com `token` e `filename`.
- **Front**: `agentClient` parseia o evento `file`; `downloadAgentFile`
  manda o Bearer.

### 8.3 Fora deste spec

Eval de LLM (“o modelo escolheu `gerar_relatorio` / `agenda_do_periodo`”),
OAuth, e-mail, Tigris, preview no chat.

---

## 9. Componentes (mapa de arquivos)

**Novos**

- `src/lib/calendar/events.js`
- `src/lib/agent/tools/catalog.js` (extraído de `registry.js`)
- `src/lib/agent/tools/read/agendaDoPeriodo.js`
- `src/lib/agent/tools/read/gerarRelatorio.js`
- `src/lib/agent/reports/render.js` (orquestra formato → buffer)
- `src/lib/agent/reports/md.js`, `csv.js`, `xlsx.js`, `pdf.js`
- `src/lib/agent/downloads.js`
- testes em `src/tests/unit/agent/` e `src/tests/integration/agent/`

**Tocados**

- `src/routes/calendar.js` — wrapper + reexport
- `src/routes/agent.js` — `GET /agent/downloads/:token`
- `src/lib/agent/tools/registry.js` — importa o catálogo; registra as 2 tools
- `src/lib/agent/loop.js` — emite `file`
- `src/lib/agent/audit.js` — `logReportGenerated({ profile, formato,
  fontes, bytes, filename })`. Só metadado; o `gerarRelatorio` chama
  depois do `remember`. Sem o buffer.
- `src/lib/agent/context/dominio/core.md` e `admin.md`
- `src/tests/integration/agent/paridadePapel.test.js` — novo caso + `semEspelho`
- `src/package.json` — `exceljs`, `pdfkit`
- `web/src/lib/agentClient.js` (+ teste)
- `web/src/lib/agentSession.js` (+ teste, persistir o anexo da bolha)
- `web/src/pages/AssistentePage.jsx` — evento `file` + botão Baixar

**Não se cria:** migration, tabela, endpoint de Calendar novo, OAuth,
job, container.

---

## 10. Fora deste spec (backlog)

Fica registrado para não passar batido; **não** entra no plano desta
fatia:

- Criar / editar / apagar evento no Google (OAuth, projeto Cloud).
- Admin ver a agenda Google de outra pessoa.
- Cruzar agenda com apontamento (“apontou 8h mas estava em reunião”).
- Rotinas agendadas, alertas proativos, conversas persistidas.
- PDF no Tigris, e-mail do relatório, histórico de arquivos gerados.
- Preview do PDF/Excel no chat.
- Canal WhatsApp (Fase 3) — o `downloads.js` é agnóstico o bastante
  para um adaptador futuro reusar; não se constrói o adaptador agora.

---

## 11. Ordem de implementação sugerida

Test-first em cada fatia; uma verde antes da próxima.

1. Extração `lib/calendar/events.js` + teste SSRF verde + rota intacta.
2. `agenda_do_periodo` + paridade com `GET /me/calendar/events` + `core.md`.
3. `downloads.js` + `GET /agent/downloads/:token`.
4. `catalog.js` + renderers + `gerar_relatorio` (admin-only, reexecução).
5. `loop.js` emite `file` + `admin.md`.
6. Front: evento + botão Baixar + persistência da bolha + 404 expirado.
