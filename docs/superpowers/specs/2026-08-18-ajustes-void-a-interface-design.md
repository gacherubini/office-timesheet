# Design — Bloco A: Sistema e Interface (itens 9, 10, 11)

**Data:** 2026-08-18
**Status:** aprovado no brainstorming; a implementar (test-first)
**Origem:** `Gestao-VOID-ajustes-desenvolvimento.pdf`, seção "SISTEMA E INTERFACE"
**Bloco:** A da `2026-08-18-ajustes-void-visao-geral.md`

> Três itens que **não tocam o modelo de dados**: o indicador da home passa a
> mostrar quem está online de verdade, a aba do navegador ganha a marca, e o
> assistente sai de "página à parte" para "acessível de qualquer tela".
> Nenhuma migration. Nenhuma definição pendente do cliente.

Por isso este bloco vem primeiro: entrega valor visível enquanto o João Pedro
fecha as pendências que travam B, C e D.

---

## 1. Decisões travadas

| Tema | Decisão | Motivo |
|---|---|---|
| Presença | `Map` em memória no processo da API | Zero escrita no banco. Ver §3 da visão geral |
| Janela de "online" | 5 minutos desde o último sinal | Sugestão do próprio PDF |
| Sinal | Toda request autenticada **+** heartbeat de 60s **+** cronômetro rodando | Cronômetro rodando é presença mesmo sem request |
| Heartbeat | Só com `document.visibilityState === 'visible'` | Aba no fundo durante o almoço não é presença |
| Ícone | Derivado de `web/src/assets/studio-vivian-simbolo.png` (1080×1080) | O asset da marca já existe no repo |
| Chat | Estado extraído para `AgentContext`; página e painel são views da mesma conversa | Único jeito de a conversa continuar entre os dois |
| Página do assistente | **Mantida** | O PDF é explícito: o painel é acesso rápido, não substitui |

---

## 2. Item 9 — "usuários online" no lugar de "usuários ativos"

### O que está errado hoje

`AdminDashboardPage.jsx:359` mostra `Usuários ativos` com
`${kpis.active_users} de ${kpis.total_users}`, e `routes/dashboard.js` calcula
`active_users` como `profiles.filter(p => p.is_active).length` — ou seja,
**quantos usuários não estão desativados no cadastro**. Não tem nada a ver com
quem está usando o sistema agora. O rótulo mente.

### Arquitetura

```
  qualquer request autenticada          POST /me/heartbeat (60s, aba visível)
              │                                      │
              └──────────────┬───────────────────────┘
                             ▼
                  src/middleware/auth.js
                    (requireAuth, já roda em tudo)
                             │
                             ▼
                  src/lib/onlineUsers.js
                    marcarVisto(userId)     ← Map<userId, timestamp>
                    usuariosOnline()        → ids vistos há < 5 min
                             │
                             ▼
                  GET /dashboard  (routes/dashboard.js)
                    online_users = online() ∪ (quem tem time_entry running)
```

### `src/lib/onlineUsers.js` (novo)

Espelha o formato e as ressalvas do `lib/userCache.js`, inclusive o comentário
sobre uma única instância no Fly.

**Nome:** `onlineUsers` e **não** `presence` — `routes/presences.js` e a tabela
`presences` (migration 028) já existem e são outra coisa: a marcação de "vou ao
escritório amanhã" da Agenda. Dois conceitos quase homônimos no mesmo repo é
armadilha para quem chegar depois.

```js
const JANELA_MS = Number(process.env.PRESENCE_WINDOW_MS) || 5 * 60_000
const vistos = new Map()          // userId -> epoch ms

export function marcarVisto(userId)   // chamado no requireAuth
export function usuariosOnline()      // Set<userId> dentro da janela
export function limparOnline()        // reset entre testes
```

Poda preguiçosa: `usuariosOnline()` remove as entradas vencidas enquanto varre. Com
dezenas de usuários não vale um timer.

**Ressalva a documentar no arquivo:** com mais de uma máquina no Fly, cada
instância teria seu próprio Map e o número sairia menor que o real. Hoje
`min_machines_running = 1` e `auto_stop_machines = off`, e o `userCache.js` já
carrega exatamente a mesma restrição — é uma decisão de infra, não duas.

### Onde entra o carimbo

Em `requireAuth`, **depois** das checagens de `deleted_at`/`is_active`/
`sessions_valid_after` — quem levou 401/403 não está online. Uma linha,
imediatamente antes de `next()`.

### `POST /me/heartbeat`

Em `routes/me.js`. Corpo vazio, responde `204`. O handler não faz nada: quem
carimba é o `requireAuth` que ele atravessa. O comentário no código precisa
dizer isso, senão parece endpoint morto e alguém apaga.

### União com cronômetro rodando

O PDF pede "sessão com atividade nos últimos 5 minutos **ou cronômetro
rodando**". A segunda metade sai do banco:

```sql
SELECT DISTINCT user_id FROM time_entries WHERE status = 'running'
```

`GET /dashboard` já é `requireAdmin` e já roda queries em paralelo — entra como
mais uma no `Promise.all`. Índice: `034_time_entries_status_started_at_idx.sql`
já cobre `status`.

### Contrato de resposta

`kpis.active_users` e `kpis.total_users` **continuam existindo** (outros
consumidores podem ler), e entra `kpis.online_users`. A tela troca o que exibe.

### Frontend

- `Layout.jsx` ganha o `useEffect` do heartbeat. É o lugar certo: embrulha toda
  página autenticada e hoje tem 10 linhas.
- `AdminDashboardPage.jsx:359` → rótulo `Usuários online`, valor
  `kpis.online_users`. Sem o "de N" — online não tem denominador.

### Testes

| Nível | Caso |
|---|---|
| unit `onlineUsers.test.js` | carimbo entra em `usuariosOnline()`; some depois da janela; poda não vaza memória; `limparOnline` zera |
| integration | `POST /me/heartbeat` → 204 e o usuário aparece em `online_users` |
| integration | usuário sem sinal nenhum **não** aparece |
| integration | usuário com `time_entry` `running` e **sem** request recente aparece |
| integration | request que toma 403 (usuário inativo) **não** marca presença |

Aceite do PDF: *"O rótulo mostra 'usuários online' e o número muda quando alguém
entra ou sai do sistema."*

---

## 3. Item 10 — ícone e título da aba

### O que existe hoje

`web/index.html` tem `<title>Gestão VOID</title>` fixo e **nenhum** ícone —
não existe nem a pasta `web/public/`. Daí o globo cinza.

### Assets

Derivados de `web/src/assets/studio-vivian-simbolo.png` (1080×1080, sobra
resolução para todos os tamanhos):

```
web/public/
├── favicon.ico              (16+32+48 multi-resolução)
├── favicon-32.png
├── apple-touch-icon.png     (180×180)
├── icon-512.png
└── manifest.json
```

Gerados com ImageMagick e **commitados** — não são build step, o Vite serve
`public/` como estático.

`manifest.json`: `name: "Gestão VOID"`, `short_name: "VOID"`,
`display: "standalone"`, `background_color`/`theme_color` vindos das variáveis
do brand book (`web/src/index.css`), `start_url: "/"`.

Atenção ao símbolo em 32×32: o que funciona num header pode virar borrão no
favicon. Se não sobreviver, o ajuste é recortar/engordar o traço no PNG de 32 —
não trocar a marca.

### Título dinâmico

O PDF pede "página atual + nome do sistema" (`Projetos · Gestão VOID`).

Hook `web/src/hooks/useDocumentTitle.js`:

```js
export function useDocumentTitle(titulo) {
  useEffect(() => {
    document.title = titulo ? `${titulo} · Gestão VOID` : 'Gestão VOID'
  }, [titulo])
}
```

Chamado em cada página (`useDocumentTitle('Projetos')`). Preferido a um mapa
rota→título centralizado: as rotas do `App.jsx` já convivem em dois idiomas
(`/projetos` e `/project-board` apontam para a mesma página), e um mapa por
path duplicaria cada entrada. A página sabe o nome dela.

Casos com nome próprio (`ProjectPage`) usam o nome do projeto:
`Grand Terroir 31 · Gestão VOID`.

### Testes

Não há teste de front no repo além de `ErrorBoundary.test.jsx` e alguns de
`lib/`. Cobrir o que é lógica: unit de `useDocumentTitle` (com e sem título).
Favicon e manifest são verificação visual — entram no roteiro de aceite, não em
teste automatizado.

Aceite do PDF: *"A aba do navegador mostra o símbolo da marca e o título da
página aberta."*

---

## 4. Item 11 — chat de IA em todas as páginas

### O que já está pronto (e economiza muito)

- **Conversa persiste no servidor** — `agent_conversations` / `agent_messages`
  (migration 037). O front guarda só o id em `localStorage`
  (`lib/agentSession.js`). Navegar entre páginas **já** não perde conversa.
- **Contexto de página já é carimbado** — `lib/agentContext.js` grava
  projeto/tarefa em `sessionStorage`, e `ProjectBoardPage.jsx` e
  `GlobalTasksPage.jsx` já chamam `carimbarContexto()`.
- **`Layout.jsx` tem 10 linhas** — encaixar o botão flutuante é trivial.

Falta o invólucro e a extração do estado.

### O problema real

`AssistentePage.jsx` tem **981 linhas** e segura tudo: mensagens, streaming SSE,
proposta de escrita, anexos, lista de conversas, layout de tela cheia. Enquanto
o estado morar lá, painel e página não conseguem ser a mesma conversa.

### Arquitetura

```
                    web/src/contexts/AgentContext.jsx        (novo)
                      mensagens, streaming, proposta,
                      anexos, conversaId, enviar(), cancelar()
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
        AssistentePage.jsx                  ChatPanel.jsx      (novo)
        (tela cheia, lista de              (drawer lateral,
         conversas, header)                 sem lista)
                                                    ▲
                                            FloatingChatButton.jsx  (novo)
                                                    │
                                              Layout.jsx
```

O `AgentProvider` monta **acima** do `Layout`, para o estado sobreviver à
navegação entre rotas.

### O que sai do `AssistentePage`

Sai: estado das mensagens, streaming, proposta, anexos, id da conversa e as
ações (`enviar`, `cancelar`, `executarProposta`, `refazer`, `editar`).
Fica: layout de tela cheia, `ListaConversas`, header, e tudo que é só dessa tela.

Os componentes de renderização já são separados (`BolhaMarkdown`,
`RodapeBolha`, `ListaConversas`) — o painel reaproveita direto. Isso é o que
torna a extração viável em vez de reescrita.

**Risco.** É refatorar o arquivo mais complexo do front, e o repo tem pouco
teste de front. Mitigação: a extração é passo próprio, com a página funcionando
igual **antes** de o painel existir. Se a página quebrar, quebrou na extração —
não numa mudança misturada com feature nova.

### O painel

- Botão flutuante no canto inferior direito, todas as páginas autenticadas.
- Abre drawer lateral. Fecha por ✕, `Esc` e clique fora.
- Some na rota `/assistente` — botão flutuante sobre a própria página do
  assistente é ruído.
- Mobile: ocupa a tela quase inteira; drawer estreito não serve para conversa.
- Colisão conhecida: `ClockInReminder` também vive no `Layout` e pode disputar o
  canto. Verificar no aceite.

### Contexto da página

`carimbarContexto()` passa a ser chamado também em:
- `PessoasPage` ao abrir a ficha de alguém (o PDF pede "projeto, tarefa **ou
  pessoa** em tela").
- `ProjectPage`, para o contexto ser do projeto aberto e não do último visitado.

`lib/agentContext.js` ganha os campos `personId`/`personName` — as funções já
recebem objeto, então é aditivo.

### Testes

| Nível | Caso |
|---|---|
| unit | `agentContext` com pessoa: carimba, lê e dispensa |
| unit | reducer do `AgentContext`: mensagem entra, streaming acumula, cancelar para |
| manual (aceite) | abrir o painel dentro de um projeto, perguntar, navegar e voltar — conversa intacta |

Aceite do PDF: *"Dentro de um projeto, abro o chat pelo botão flutuante,
pergunto e volto ao projeto sem perder tela nem conversa."*

---

## 5. Ordem de implementação

1. **Item 10** — favicon, manifest, título. Isolado, sem risco, resultado visível na hora.
2. **Item 9** — `onlineUsers.js`, heartbeat, KPI. Backend com teste, contido.
3. **Item 11 (a)** — extrair `AgentContext`, página continuando idêntica.
4. **Item 11 (b)** — `ChatPanel` + botão flutuante + contexto de pessoa.

O passo 3 é o único arriscado do bloco. Está por último de propósito: se
precisar parar, 9 e 10 já estão entregues.
