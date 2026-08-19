# Bloco A2 — Chat de IA em todas as páginas (item 11) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O assistente deixa de ser uma página à parte e passa a ser alcançável de qualquer tela por um botão flutuante, sem tirar a pessoa de onde está e sem perder a conversa.

**Architecture:** O estado da conversa sai de `AssistentePage.jsx` (981 linhas) para um `AgentContext` montado acima do router. A página e um painel lateral novo viram duas *views* da mesma conversa. O que é do DOM de cada view (input, scroll, textarea) fica na view; o que é da conversa (mensagens, streaming, proposta, anexo, lista) vai para o contexto. A ponte entre os dois é um registro de scroll que a view ativa assina.

**Tech Stack:** React 19 (contexto + hooks), Vitest + Testing Library + jsdom.

**Spec:** `docs/superpowers/specs/2026-08-18-ajustes-void-a-interface-design.md` (item 11)

## Global Constraints

- **A página do assistente continua existindo.** O PDF é explícito: o painel é acesso rápido, **não** a substitui. Nenhuma tarefa aqui apaga `/assistente`.
- **Refatoração e feature são passos separados.** As Tasks 1–4 não mudam nenhum comportamento visível: a página tem que continuar funcionando exatamente igual. O painel só nasce na Task 5. Se a página quebrar, quebrou na extração — e você sabe onde procurar.
- **Nada de reescrever a lógica durante a mudança.** Funções movidas vão **verbatim**, com as trocas mecânicas listadas em cada passo. Melhoria de lógica é outro commit, depois de tudo verde.
- **O transcript já é do servidor.** `agent_conversations`/`agent_messages` (migration 037) e `lib/agentSession.js` guardam a conversa; navegar entre páginas **já** não perde nada hoje. O que falta é o invólucro — não invente persistência nova.
- Comentários em **português**, como o resto do repo.
- Baseline antes deste plano: `cd web && npx vitest run` → 18 arquivos / 142 testes (contando o que o plano A1 acrescentou).

## Mapa da extração

Decidido lendo `AssistentePage.jsx` inteiro. Guarde esta tabela: ela é o contrato das Tasks 2 e 3.

| Vai para o `AgentContext` | Fica na view (página / painel) |
|---|---|
| `mensagens`, `conversa`, `ocupado` | `input`, `painelAberto` |
| `arquivo`, `anexoErro`, `sugestoes` | `textareaRef`, `fileInputRef`, `listaRef` |
| `contextoAtivo`, `itens` | `pertoDoFundoRef` |
| `abortRef`, `pincelRef` | `atualizarPertoDoFundo`, `rolarParaFim`, `ajustarAltura` |
| `restauradoRef`, `contextoLidoRef` | `editarPergunta`, `renderComposer`, `renderLista` |
| `recarregarLista`, `receber`, `correr` | |
| `enviar`, `tentarStream`, `refazer` | |
| `aprovar`, `baixar`, `cancelar` | |
| `novaConversa`, `selecionarConversa` | |
| `renomearConversa`, `apagarConversa` | |
| `escolherArquivo` | |

**O nó da extração:** `correr()` e `receber()` chamam `rolarParaFim()` e leem `pertoDoFundoRef`, que são do DOM da view. Se ambos fossem para o contexto, ele passaria a conhecer o `<div>` de uma tela específica — e com duas views isso quebra na hora. A solução é a Task 2, Step 3: a view **registra** dois handlers no contexto, e o contexto só pergunta "estou perto do fundo?" e "role para o fim", sem saber de quem.

---

### Task 1: Rede de segurança antes de mexer

**Files:**
- Create: `web/src/pages/AssistentePage.test.jsx`

**Interfaces:**
- Consumes: nada.
- Produces: nada. Este teste existe para **não** mudar de resultado nas Tasks 2–4.

- [ ] **Step 1: Escrever o teste de caracterização**

Isto não é TDD — é rede de segurança. `AssistentePage.jsx` tem 981 linhas e **zero** testes. Vamos mover ~470 delas. O teste abaixo descreve o comportamento de hoje e precisa continuar verde depois de cada tarefa; ele é o sinal de que a refatoração não mudou nada.

Create `web/src/pages/AssistentePage.test.jsx`:

```jsx
/** @vitest-environment jsdom */
// Teste de CARACTERIZAÇÃO: descreve o que a página já faz hoje, para a extração
// do AgentContext (plano A2) não mudar comportamento sem ninguém perceber.
// Não é especificação de feature nova — se algum caso aqui falhar durante a
// refatoração, a refatoração está errada, não o teste.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// O cliente do agente fala com a rede; aqui ninguém sai da máquina.
vi.mock('../lib/agentClient', () => ({
  streamChat: vi.fn(async () => {}),
  executeProposal: vi.fn(async () => ({})),
  cancelProposal: vi.fn(async () => ({})),
  downloadAgentFile: vi.fn(async () => {}),
  listConversations: vi.fn(async () => ({ items: [] })),
  getConversation: vi.fn(async () => ({ id: 'c1', messages: [] })),
  renameConversation: vi.fn(async () => ({ title: 'x' })),
  deleteConversation: vi.fn(async () => ({})),
  avaliarResposta: vi.fn(async () => ({})),
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'u1', name: 'Ana Silva', role: 'employee' } }),
}))

import { AssistentePage } from './AssistentePage'

function renderizar() {
  return render(
    <MemoryRouter>
      <AssistentePage />
    </MemoryRouter>,
  )
}

describe('AssistentePage (caracterização)', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  afterEach(cleanup)

  it('monta sem estourar e mostra o estado vazio', () => {
    renderizar()
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('trata o primeiro nome de quem está logado', () => {
    renderizar()
    // aberturaDoPapel() usa o primeiro nome; "Silva" não pode aparecer.
    expect(document.body.textContent).toContain('Ana')
    expect(document.body.textContent).not.toContain('Ana Silva')
  })

  it('mostra os chips de abertura do papel employee', () => {
    renderizar()
    // Definidos em lib/agentOpening.js, POR_PAPEL.employee.chips
    expect(document.body.textContent).toContain('Quantas horas lancei este mês?')
  })

  it('o campo de texto começa vazio', () => {
    renderizar()
    expect(screen.getByRole('textbox').value).toBe('')
  })
})
```

- [ ] **Step 2: Rodar e verificar que passa AGORA**

```bash
cd web && npx vitest run src/pages/AssistentePage.test.jsx
```

Expected: PASS, 4 testes. **Se falhar, pare.** Um teste de caracterização que já nasce vermelho não serve de rede — ajuste os seletores ao que a página realmente renderiza (rode com `--reporter=verbose` e inspecione `document.body.innerHTML`) até ele descrever a verdade de hoje.

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/AssistentePage.test.jsx
git commit -m "test(web): caracterização do AssistentePage antes da extração do contexto"
```

---

### Task 2: `AgentContext` — o estado da conversa, ainda sem consumidor

**Files:**
- Create: `web/src/contexts/AgentContext.jsx`
- Test: `web/src/contexts/AgentContext.test.jsx`

**Interfaces:**
- Consumes: `lib/agentClient.js`, `lib/agentSession.js`, `lib/agentContext.js`, `lib/agentPincel.js`, `lib/agentFiles.js`, `lib/agentAcoes.js`, `contexts/AuthContext`.
- Produces: `<AgentProvider>` e `useAgent()`, devolvendo:

```
{
  mensagens, conversa, ocupado, arquivo, anexoErro, sugestoes,
  contextoAtivo, itens,
  enviar(texto), tentarStream(idxBot), refazer(idxBot),
  aprovar(idx), baixar(idx, token), cancelar(idx),
  escolherArquivo(event), setArquivo, setAnexoErro,
  novaConversa(), selecionarConversa(id),
  renomearConversa(id, title), apagarConversa(id),
  recarregarLista(), dispensarContextoAtivo(),
  registrarScroll({ pertoDoFundo, rolarParaFim })
}
```

- [ ] **Step 1: Write the failing test**

Create `web/src/contexts/AgentContext.test.jsx`:

```jsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup, waitFor } from '@testing-library/react'

const streamChat = vi.fn(async () => {})
const listConversations = vi.fn(async () => ({ items: [] }))
const getConversation = vi.fn(async () => ({ id: 'c1', messages: [] }))
const executeProposal = vi.fn(async () => ({}))
const cancelProposal = vi.fn(async () => ({}))

vi.mock('../lib/agentClient', () => ({
  streamChat: (...a) => streamChat(...a),
  executeProposal: (...a) => executeProposal(...a),
  cancelProposal: (...a) => cancelProposal(...a),
  downloadAgentFile: vi.fn(async () => {}),
  listConversations: (...a) => listConversations(...a),
  getConversation: (...a) => getConversation(...a),
  renameConversation: vi.fn(async () => ({ title: 'x' })),
  deleteConversation: vi.fn(async () => ({})),
  avaliarResposta: vi.fn(async () => ({})),
}))

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'u1', name: 'Ana', role: 'employee' } }),
}))

import { AgentProvider, useAgent } from './AgentContext'

// Sonda: expõe o contexto no DOM e guarda a referência para os testes agirem.
let api
function Sonda() {
  api = useAgent()
  return (
    <div>
      <span data-testid="qtd">{api.mensagens.length}</span>
      <span data-testid="ocupado">{String(api.ocupado)}</span>
      <span data-testid="conversa">{String(api.conversa)}</span>
    </div>
  )
}

function montar() {
  return render(<AgentProvider><Sonda /></AgentProvider>)
}

describe('AgentContext', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
  })
  afterEach(cleanup)

  it('começa vazio e ocioso', () => {
    montar()
    expect(screen.getByTestId('qtd').textContent).toBe('0')
    expect(screen.getByTestId('ocupado').textContent).toBe('false')
  })

  it('enviar acrescenta o par pergunta/resposta', async () => {
    montar()
    await act(async () => { await api.enviar('oi') })
    // Uma bolha do usuário + uma do bot.
    expect(screen.getByTestId('qtd').textContent).toBe('2')
    expect(api.mensagens[0].autor).toBe('user')
    expect(api.mensagens[0].texto).toBe('oi')
    expect(api.mensagens[1].autor).toBe('bot')
  })

  it('enviar chama o streamChat com o texto', async () => {
    montar()
    await act(async () => { await api.enviar('quantas horas?') })
    expect(streamChat).toHaveBeenCalledTimes(1)
    expect(streamChat.mock.calls[0][0].message).toBe('quantas horas?')
  })

  it('enviar texto vazio não faz nada', async () => {
    montar()
    await act(async () => { await api.enviar('   ') })
    expect(streamChat).not.toHaveBeenCalled()
    expect(screen.getByTestId('qtd').textContent).toBe('0')
  })

  it('o evento session grava o id da conversa', async () => {
    streamChat.mockImplementationOnce(async ({ onEvent }) => {
      onEvent({ type: 'session', conversation_id: 'c-42' })
    })
    montar()
    await act(async () => { await api.enviar('oi') })
    await waitFor(() => expect(screen.getByTestId('conversa').textContent).toBe('c-42'))
  })

  it('o evento answer preenche o texto da bolha do bot', async () => {
    streamChat.mockImplementationOnce(async ({ onEvent }) => {
      onEvent({ type: 'answer', text: 'Você lançou 12h.' })
    })
    montar()
    await act(async () => { await api.enviar('quantas horas?') })
    await waitFor(() => expect(api.mensagens[1].texto).toContain('Você lançou 12h.'))
  })

  it('o evento error marca a bolha com erro', async () => {
    streamChat.mockImplementationOnce(async ({ onEvent }) => {
      onEvent({ type: 'error', error: 'Deu ruim.' })
    })
    montar()
    await act(async () => { await api.enviar('oi') })
    await waitFor(() => expect(api.mensagens[1].erro).toBe('Deu ruim.'))
  })

  it('novaConversa limpa mensagens e id', async () => {
    montar()
    await act(async () => { await api.enviar('oi') })
    await act(async () => { api.novaConversa() })
    expect(screen.getByTestId('qtd').textContent).toBe('0')
    expect(screen.getByTestId('conversa').textContent).toBe('null')
  })

  // A ponte com o DOM da view: o contexto NÃO conhece o <div> de ninguém. Ele
  // pergunta a quem se registrou. É isto que permite página e painel serem
  // duas views da mesma conversa.
  it('usa os handlers de scroll que a view registrar', async () => {
    const rolarParaFim = vi.fn()
    montar()
    act(() => { api.registrarScroll({ pertoDoFundo: () => true, rolarParaFim }) })
    await act(async () => { await api.enviar('oi') })
    await waitFor(() => expect(rolarParaFim).toHaveBeenCalled())
  })

  it('sem view registrada, enviar não estoura', async () => {
    montar()
    await act(async () => { await api.enviar('oi') })
    expect(screen.getByTestId('qtd').textContent).toBe('2')
  })

  it('useAgent fora do provider avisa em vez de devolver undefined', () => {
    function Solto() { useAgent(); return null }
    expect(() => render(<Solto />)).toThrow(/AgentProvider/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web && npx vitest run src/contexts/AgentContext.test.jsx
```

Expected: FAIL — `Failed to resolve import "./AgentContext"`.

- [ ] **Step 3: Criar o esqueleto do contexto**

Create `web/src/contexts/AgentContext.jsx` com a estrutura abaixo. Os corpos marcados `/* MOVER */` recebem o código de `AssistentePage.jsx` no Step 4 — escreva-os vazios agora só para o arquivo existir e o teste apontar o erro certo.

```jsx
import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from './AuthContext'
import {
  streamChat, executeProposal, cancelProposal, downloadAgentFile,
  listConversations, getConversation, renameConversation, deleteConversation,
} from '../lib/agentClient'
import { lerSessao, salvarSessao, limparSessao } from '../lib/agentSession'
import { arquivosDaMensagem, anexarArquivo } from '../lib/agentFiles'
import { lerContexto, dispensarContexto } from '../lib/agentContext'
import { criarPincel } from '../lib/agentPincel'
import { limparParaRefazer } from '../lib/agentAcoes'

const MAX_ANEXO_BYTES = 10 * 1024 * 1024 // espelha o teto do servidor

const Ctx = createContext(null)

// Uma conversa por sessão do usuário, viva acima do router: é o que faz o
// painel lateral e a página /assistente serem a MESMA conversa em vez de duas.
// Ver docs/superpowers/specs/2026-08-18-ajustes-void-a-interface-design.md §4.
export function AgentProvider({ children }) {
  const { profile } = useAuth()

  const [mensagens, setMensagens] = useState([])
  const [conversa, setConversa] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [arquivo, setArquivo] = useState(null)
  const [anexoErro, setAnexoErro] = useState(null)
  const [sugestoes, setSugestoes] = useState([])
  const [contextoAtivo, setContextoAtivo] = useState(null)
  const [itens, setItens] = useState([])

  const abortRef = useRef(null)
  const pincelRef = useRef(null)
  const restauradoRef = useRef(false)
  const contextoLidoRef = useRef(false)

  // A ponte com o DOM: a view ativa registra como rolar a lista DELA. O
  // contexto nunca toca em elemento — só pergunta. Sem isso, o contexto
  // precisaria conhecer o <div> de uma tela específica, e com duas views
  // (página e painel) isso quebra na hora.
  const scrollRef = useRef(null)

  const registrarScroll = useCallback((handlers) => {
    scrollRef.current = handlers
  }, [])

  function pertoDoFundo() {
    return scrollRef.current?.pertoDoFundo?.() ?? false
  }

  function rolarParaFim() {
    scrollRef.current?.rolarParaFim?.()
  }

  useEffect(() => () => { pincelRef.current?.parar() }, [])

  async function recarregarLista() { /* MOVER: corpo de AssistentePage.recarregarLista */ }

  function receber(idxBot) { /* MOVER: corpo de AssistentePage.receber */ }

  async function correr(idxBot, texto, file, signal) { /* MOVER: corpo de AssistentePage.correr */ }

  function escolherArquivo(e) { /* MOVER */ }
  async function enviar(textoArg) { /* MOVER, ver Step 4 */ }
  async function tentarStream(idxBot) { /* MOVER */ }
  async function refazer(idxBot) { /* MOVER */ }
  async function aprovar(idx) { /* MOVER */ }
  async function baixar(idx, token) { /* MOVER */ }
  async function cancelar(idx) { /* MOVER */ }
  function novaConversa() { /* MOVER, ver Step 4 */ }
  async function selecionarConversa(id) { /* MOVER, ver Step 4 */ }
  async function renomearConversa(id, title) { /* MOVER */ }
  async function apagarConversa(id) { /* MOVER */ }

  function dispensarContextoAtivo() {
    dispensarContexto()
    setContextoAtivo(null)
  }

  const valor = {
    mensagens, conversa, ocupado, arquivo, anexoErro, sugestoes, contextoAtivo, itens,
    setArquivo, setAnexoErro,
    enviar, tentarStream, refazer, aprovar, baixar, cancelar, escolherArquivo,
    novaConversa, selecionarConversa, renomearConversa, apagarConversa,
    recarregarLista, dispensarContextoAtivo, registrarScroll,
  }

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useAgent() {
  const ctx = useContext(Ctx)
  // Falhar alto: um contexto nulo viraria "cannot read property of null" dez
  // frames adiante, longe da causa.
  if (!ctx) throw new Error('useAgent precisa estar dentro de <AgentProvider>.')
  return ctx
}
```

- [ ] **Step 4: Mover os corpos de `AssistentePage.jsx`**

Copie cada função de `AssistentePage.jsx` **verbatim** para o corpo correspondente. As únicas trocas permitidas — todas mecânicas:

| Onde | Trocar | Por |
|---|---|---|
| `receber`, `correr` | `pertoDoFundoRef.current` | `pertoDoFundo()` |
| `receber`, `correr` | `rolarParaFim` (a função local) | a `rolarParaFim` do provider |
| `enviar` | `const texto = (typeof textoArg === 'string' ? textoArg : input).trim()` | `const texto = String(textoArg ?? '').trim()` |
| `enviar` | `setInput('')` e o bloco `if (textareaRef.current) ...` | **apagar** — são da view |
| `novaConversa` | `setInput('')`, `setPainelAberto(false)`, os dois blocos de `textareaRef` | **apagar** — são da view |
| `selecionarConversa` | `setPainelAberto(false)` | **apagar** — é da view |

Também mova para o provider os dois `useEffect` de restauração:

```jsx
  // Restaura só o id (v2). O transcript vem do GET — propostas já nascem
  // expiradas. Lista carrega junto. 404 some o id; 503 (kill switch) não.
  useEffect(() => {
    if (restauradoRef.current || !profile?.id) return
    restauradoRef.current = true
    recarregarLista()
    const salvo = lerSessao(profile.id)
    if (!salvo?.conversationId) return
    getConversation(salvo.conversationId)
      .then((c) => {
        setMensagens(c.messages || [])
        setConversa(c.id)
      })
      .catch((err) => {
        if (/não encontrad/i.test(err?.message || '')) limparSessao()
      })
  }, [profile?.id])

  // Chip de contexto: lê o carimbo da aba uma vez. Dismiss vive no
  // sessionStorage — remount não ressuscita o chip.
  useEffect(() => {
    if (contextoLidoRef.current) return
    setContextoAtivo(lerContexto())
    contextoLidoRef.current = true
  }, [])
```

O `useEffect` de foco no textarea (`textareaRef.current?.focus()`) **não** vai: é da view.

- [ ] **Step 5: Run test to verify it passes**

```bash
cd web && npx vitest run src/contexts/AgentContext.test.jsx
```

Expected: PASS, 11 testes.

- [ ] **Step 6: Confirmar que a página ainda não foi tocada**

```bash
cd web && npx vitest run src/pages/AssistentePage.test.jsx
```

Expected: PASS, 4 testes. A página ainda tem a lógica dela; o contexto é uma cópia paralela e ninguém o consome. Duplicação temporária, de propósito — é o que permite as duas coisas estarem verdes ao mesmo tempo antes da troca.

- [ ] **Step 7: Commit**

```bash
git add web/src/contexts/AgentContext.jsx web/src/contexts/AgentContext.test.jsx
git commit -m "feat(web): AgentContext com o estado da conversa, ainda sem consumidor"
```

---

### Task 3: A página passa a consumir o contexto

**Files:**
- Modify: `web/src/main.jsx` (montar o provider)
- Modify: `web/src/pages/AssistentePage.jsx` (remover o estado, consumir o contexto)

**Interfaces:**
- Consumes: `AgentProvider`, `useAgent()` da Task 2.
- Produces: nada novo. **Comportamento idêntico ao de antes.**

- [ ] **Step 1: Montar o provider acima do router**

Em `web/src/main.jsx`, envolva `<App />`. Precisa ficar **dentro** do `AuthProvider` (o contexto usa `useAuth`) e **fora** do `App`, para o estado sobreviver à troca de rota:

```jsx
import { AgentProvider } from './contexts/AgentContext'
```

```jsx
      <BrowserRouter>
        <AuthProvider>
          {/* Fora do App de propósito: o estado da conversa precisa sobreviver
              à navegação entre rotas, senão o painel perde o fio ao mudar de
              página — que é justamente o que o item 11 pede para não acontecer. */}
          <AgentProvider>
            <App />
          </AgentProvider>
        </AuthProvider>
      </BrowserRouter>
```

- [ ] **Step 2: Trocar o estado da página pelo contexto**

Em `web/src/pages/AssistentePage.jsx`:

1. Adicione `import { useAgent } from '../contexts/AgentContext'`.
2. **Apague** as declarações de `mensagens`, `conversa`, `ocupado`, `arquivo`, `anexoErro`, `sugestoes`, `contextoAtivo`, `itens` e os refs `abortRef`, `pincelRef`, `restauradoRef`, `contextoLidoRef`.
3. **Apague** as funções que foram para o contexto (a coluna esquerda do Mapa da extração), os dois `useEffect` de restauração e o `useEffect` de cleanup do pincel.
4. No lugar, no topo do componente:

```jsx
  const {
    mensagens, conversa, ocupado, arquivo, anexoErro, sugestoes, contextoAtivo, itens,
    setArquivo, setAnexoErro,
    enviar, tentarStream, refazer, aprovar, baixar, cancelar, escolherArquivo,
    novaConversa: novaConversaCtx, selecionarConversa: selecionarConversaCtx,
    renomearConversa, apagarConversa, dispensarContextoAtivo, registrarScroll,
  } = useAgent()
```

5. **Mantenha** `input`, `painelAberto`, `textareaRef`, `fileInputRef`, `listaRef`, `pertoDoFundoRef`, `atualizarPertoDoFundo`, `rolarParaFim`, `ajustarAltura`, `editarPergunta`.

6. Registre o scroll desta view:

```jsx
  // Enquanto a página estiver montada, é a lista DELA que o contexto rola.
  useEffect(() => {
    registrarScroll({
      pertoDoFundo: () => pertoDoFundoRef.current,
      rolarParaFim,
    })
    return () => registrarScroll(null)
  }, [registrarScroll])
```

7. Reponha o que era da view em volta das ações do contexto:

```jsx
  // O contexto cuida da conversa; o input e o textarea são desta tela.
  async function enviarDaPagina(textoArg) {
    const texto = (typeof textoArg === 'string' ? textoArg : input).trim()
    if ((!texto && !arquivo) || ocupado) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    await enviar(texto)
  }

  function novaConversa() {
    novaConversaCtx()
    setInput('')
    setPainelAberto(false)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    textareaRef.current?.focus()
  }

  async function selecionarConversa(id) {
    await selecionarConversaCtx(id)
    setPainelAberto(false)
  }
```

8. Troque as chamadas de `enviar(...)` no JSX por `enviarDaPagina(...)`.

9. Mantenha o `useEffect` de foco (`textareaRef.current?.focus()`), que é da view.

- [ ] **Step 3: Rodar o teste de caracterização**

```bash
cd web && npx vitest run src/pages/AssistentePage.test.jsx
```

Expected: FAIL — a página agora exige o `AgentProvider` e o teste a renderiza solta.

- [ ] **Step 4: Ajustar o teste de caracterização para o provider**

No `web/src/pages/AssistentePage.test.jsx`, troque o `renderizar()`:

```jsx
import { AgentProvider } from '../contexts/AgentContext'

function renderizar() {
  return render(
    <MemoryRouter>
      <AgentProvider>
        <AssistentePage />
      </AgentProvider>
    </MemoryRouter>,
  )
}
```

E acrescente o mock que o provider usa (o `AuthContext` já está mockado com caminho `'../contexts/AuthContext'`, que serve para os dois).

**Este é o único ajuste permitido no teste de caracterização.** Nenhuma asserção pode mudar — se alguma precisar mudar, o comportamento mudou, e aí a refatoração está errada.

- [ ] **Step 5: Rodar tudo**

```bash
cd web && npx vitest run
```

Expected: PASS. 20 arquivos / 157 testes.

- [ ] **Step 6: Conferir no navegador — este passo não é opcional**

```bash
cd src && npm run dev     # terminal 1
cd web && npm run dev     # terminal 2
```

Em `/assistente`, exercite o que o teste não alcança:
1. Mande uma pergunta e veja o texto sendo pintado aos poucos (o pincel).
2. Interrompa no meio — a bolha fecha com "Interrompido".
3. Anexe um `.txt` e mande.
4. Peça algo que gere proposta (ex.: "quero pedir férias") e **cancele**.
5. Crie conversa nova, troque para a anterior pela lista, renomeie e apague.
6. Recarregue a página: a conversa volta.

Se qualquer um falhar, o problema está na Task 2 Step 4 (alguma troca que não era mecânica).

- [ ] **Step 7: Commit**

```bash
git add web/src/main.jsx web/src/pages/AssistentePage.jsx web/src/pages/AssistentePage.test.jsx
git commit -m "refactor(web): AssistentePage consome o AgentContext em vez de estado próprio"
```

---

### Task 4: Botão flutuante e painel lateral

**Files:**
- Create: `web/src/components/assistente/ChatPanel.jsx`
- Create: `web/src/components/assistente/FloatingChatButton.jsx`
- Create: `web/src/components/assistente/ChatPanel.test.jsx`
- Modify: `web/src/components/Layout.jsx`

**Interfaces:**
- Consumes: `useAgent()` da Task 2; `BolhaMarkdown` e `RodapeBolha` de `components/assistente/`.
- Produces: nada para tarefas seguintes.

- [ ] **Step 1: Write the failing test**

Create `web/src/components/assistente/ChatPanel.test.jsx`:

```jsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../lib/agentClient', () => ({
  streamChat: vi.fn(async () => {}),
  executeProposal: vi.fn(async () => ({})),
  cancelProposal: vi.fn(async () => ({})),
  downloadAgentFile: vi.fn(async () => {}),
  listConversations: vi.fn(async () => ({ items: [] })),
  getConversation: vi.fn(async () => ({ id: 'c1', messages: [] })),
  renameConversation: vi.fn(async () => ({ title: 'x' })),
  deleteConversation: vi.fn(async () => ({})),
  avaliarResposta: vi.fn(async () => ({})),
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'u1', name: 'Ana', role: 'employee' } }),
}))

import { AgentProvider } from '../../contexts/AgentContext'
import { ChatPanel } from './ChatPanel'

function montar(props = {}) {
  return render(
    <MemoryRouter>
      <AgentProvider>
        <ChatPanel aberto onFechar={() => {}} {...props} />
      </AgentProvider>
    </MemoryRouter>,
  )
}

describe('ChatPanel', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear() })
  afterEach(cleanup)

  it('fechado não renderiza conteúdo', () => {
    render(
      <MemoryRouter>
        <AgentProvider>
          <ChatPanel aberto={false} onFechar={() => {}} />
        </AgentProvider>
      </MemoryRouter>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('aberto mostra o painel com campo de texto', () => {
    montar()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('Esc fecha o painel', () => {
    const onFechar = vi.fn()
    montar({ onFechar })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onFechar).toHaveBeenCalled()
  })

  it('o botão de fechar chama onFechar', () => {
    const onFechar = vi.fn()
    montar({ onFechar })
    fireEvent.click(screen.getByLabelText('Fechar o chat'))
    expect(onFechar).toHaveBeenCalled()
  })

  it('tem link para a página do assistente — o painel não a substitui', () => {
    montar()
    expect(screen.getByRole('link', { name: /assistente/i }).getAttribute('href')).toBe('/assistente')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web && npx vitest run src/components/assistente/ChatPanel.test.jsx
```

Expected: FAIL — `Failed to resolve import "./ChatPanel"`.

- [ ] **Step 3: Criar o painel**

Create `web/src/components/assistente/ChatPanel.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { X, Send, Maximize2 } from 'lucide-react'
import { useAgent } from '../../contexts/AgentContext'
import { BolhaMarkdown } from './BolhaMarkdown'

// Acesso rápido ao assistente de qualquer tela. É uma VIEW da mesma conversa
// que /assistente — o estado vive no AgentContext, não aqui. A página continua
// existindo para conversa longa (lista de conversas, anexos, tela cheia); o
// PDF é explícito que o painel não a substitui.
export function ChatPanel({ aberto, onFechar }) {
  const { mensagens, ocupado, enviar, registrarScroll } = useAgent()
  const [input, setInput] = useState('')
  const listaRef = useRef(null)
  const pertoDoFundoRef = useRef(true)

  // Enquanto o painel estiver aberto, é a lista DELE que o contexto rola.
  // Ao fechar, devolve o comando para quem estiver montado (a página, se for o
  // caso) — por isso o cleanup registra null em vez de deixar pendurado.
  useEffect(() => {
    if (!aberto) return undefined
    registrarScroll({
      pertoDoFundo: () => pertoDoFundoRef.current,
      rolarParaFim: () => {
        const el = listaRef.current
        if (!el) return
        el.scrollTop = el.scrollHeight
        pertoDoFundoRef.current = true
      },
    })
    return () => registrarScroll(null)
  }, [aberto, registrarScroll])

  useEffect(() => {
    if (!aberto) return undefined
    function aoTeclar(e) { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aberto, onFechar])

  if (!aberto) return null

  function aoRolar() {
    const el = listaRef.current
    if (!el) return
    pertoDoFundoRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  async function submeter(e) {
    e.preventDefault()
    const texto = input.trim()
    if (!texto || ocupado) return
    setInput('')
    await enviar(texto)
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onFechar}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label="Assistente"
        className="fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-border-subtle bg-surface shadow-2xl sm:w-[420px]"
      >
        <header className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <span className="text-sm font-medium text-text-primary">Assistente</span>
          <div className="flex items-center gap-1">
            <Link
              to="/assistente"
              onClick={onFechar}
              aria-label="Abrir o assistente em tela cheia"
              title="Abrir em tela cheia"
              className="p-1.5 text-text-secondary hover:text-text-primary"
            >
              <Maximize2 size={15} />
            </Link>
            <button
              type="button"
              onClick={onFechar}
              aria-label="Fechar o chat"
              className="p-1.5 text-text-secondary hover:text-text-primary"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <div ref={listaRef} onScroll={aoRolar} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {mensagens.length === 0 && (
            <p className="text-sm text-text-secondary">
              Pergunte alguma coisa. A conversa continua na página do assistente.
            </p>
          )}
          {mensagens.map((msg, i) => (
            <div key={i} className={msg.autor === 'user' ? 'text-right' : ''}>
              <div
                className={`inline-block max-w-[92%] px-3 py-2 text-sm ${
                  msg.autor === 'user'
                    ? 'bg-surface-alt text-text-primary'
                    : 'text-text-primary'
                }`}
              >
                {msg.autor === 'bot' ? <BolhaMarkdown texto={msg.texto || ''} /> : msg.texto}
                {msg.erro && <p className="mt-1 text-xs state-danger">{msg.erro}</p>}
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={submeter} className="flex items-end gap-2 border-t border-border-subtle p-3">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submeter(e) }
            }}
            placeholder="Pergunte alguma coisa..."
            className="max-h-32 flex-1 resize-none border border-border-subtle bg-bg px-3 py-2 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={ocupado || !input.trim()}
            aria-label="Enviar"
            className="border border-border-subtle p-2 text-text-primary disabled:opacity-40"
          >
            <Send size={15} />
          </button>
        </form>
      </aside>
    </>
  )
}
```

Confira as props reais de `BolhaMarkdown` antes de rodar (`cat web/src/components/assistente/BolhaMarkdown.jsx`) e ajuste o nome da prop se não for `texto`.

- [ ] **Step 4: Criar o botão flutuante**

Create `web/src/components/assistente/FloatingChatButton.jsx`:

```jsx
import { Sparkles } from 'lucide-react'

// Canto inferior direito, em todas as telas autenticadas. Fica ACIMA do
// ClockInReminder no eixo vertical para os dois não disputarem o mesmo canto.
export function FloatingChatButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Abrir o assistente"
      title="Assistente"
      className="fixed bottom-20 right-5 z-30 flex h-12 w-12 items-center justify-center border border-border-subtle bg-ink text-white shadow-lg transition-transform hover:scale-105"
    >
      <Sparkles size={18} />
    </button>
  )
}
```

- [ ] **Step 5: Montar no Layout**

`web/src/components/Layout.jsx` (partindo do que a Task 4 do plano A1 deixou):

```jsx
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Topbar } from './Topbar'
import { ClockInReminder } from './ClockInReminder'
import { ChatPanel } from './assistente/ChatPanel'
import { FloatingChatButton } from './assistente/FloatingChatButton'
import { api } from '../lib/api'

const HEARTBEAT_MS = 60_000

export function Layout({ children }) {
  const [chatAberto, setChatAberto] = useState(false)
  const { pathname } = useLocation()

  // Botão flutuante sobre a própria página do assistente seria ruído.
  const naPaginaDoAssistente = pathname.startsWith('/assistente')

  // Sinal de vida para o indicador "usuários online" (src/lib/onlineUsers.js).
  // Só com a aba visível: aba aberta no fundo durante o almoço não é presença.
  // Falha em silêncio — perder um heartbeat não pode virar erro na tela.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') {
        api.post('/me/heartbeat').catch(() => {})
      }
    }, HEARTBEAT_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <Topbar />
      <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
      <ClockInReminder />
      {!naPaginaDoAssistente && (
        <>
          <FloatingChatButton onClick={() => setChatAberto(true)} />
          <ChatPanel aberto={chatAberto} onFechar={() => setChatAberto(false)} />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd web && npx vitest run src/components/assistente/ChatPanel.test.jsx
```

Expected: PASS, 5 testes.

- [ ] **Step 7: Rodar tudo e conferir o aceite do PDF**

```bash
cd web && npx vitest run
```

Expected: PASS. 21 arquivos / 162 testes.

Depois, no navegador — **este é o aceite literal do item 11**:
1. Entre num projeto (`/projetos`, abra um).
2. Abra o chat pelo botão flutuante e pergunte alguma coisa.
3. Feche o painel: você continua no mesmo projeto, na mesma posição.
4. Navegue para `/pessoas` e reabra o painel: **a conversa está lá**.
5. Vá para `/assistente`: **a mesma conversa**, agora em tela cheia.
6. Confira que o botão flutuante some em `/assistente`.
7. Confira que o botão não cobre o `ClockInReminder`.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/assistente/ChatPanel.jsx web/src/components/assistente/FloatingChatButton.jsx web/src/components/assistente/ChatPanel.test.jsx web/src/components/Layout.jsx
git commit -m "feat(web): chat do assistente em painel lateral acessível de todas as páginas"
```

---

### Task 5: Contexto da página em pessoa e projeto

**Files:**
- Modify: `web/src/lib/agentContext.js`
- Modify: `web/src/lib/agentContext.test.js`
- Modify: `web/src/pages/projectBoard/ProjectPage.jsx`
- Modify: `web/src/pages/PessoasPage.jsx`

**Interfaces:**
- Consumes: `carimbarContexto` de `lib/agentContext.js`.
- Produces: `carimbarContexto` passa a aceitar `personId` e `personName`.

- [ ] **Step 1: Write the failing test**

O PDF pede que o chat receba o contexto de "projeto, tarefa **ou pessoa** em tela". Projeto e tarefa já são carimbados por `ProjectBoardPage.jsx` e `GlobalTasksPage.jsx`; pessoa não existe.

Acrescente ao fim de `web/src/lib/agentContext.test.js`:

```js
it('carimba pessoa e devolve na leitura', () => {
  carimbarContexto({ personId: 'p1', personName: 'Luiz Eduardo' })
  const ctx = lerContexto()
  expect(ctx.personId).toBe('p1')
  expect(ctx.personName).toBe('Luiz Eduardo')
})

it('pessoa e projeto não se atropelam num carimbo só', () => {
  carimbarContexto({ projectId: 'pr1', projectName: 'Obra', personId: 'p1', personName: 'Luiz' })
  const ctx = lerContexto()
  expect(ctx.projectName).toBe('Obra')
  expect(ctx.personName).toBe('Luiz')
})

it('carimbo sem pessoa deixa os campos nulos, não ausentes', () => {
  carimbarContexto({ projectId: 'pr1', projectName: 'Obra' })
  const ctx = lerContexto()
  expect(ctx.personId).toBeNull()
  expect(ctx.personName).toBeNull()
})
```

Confira o topo do arquivo: se `lerContexto` ainda não estiver no `import`, acrescente-o.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web && npx vitest run src/lib/agentContext.test.js
```

Expected: FAIL — `expected undefined to be 'p1'`.

- [ ] **Step 3: Aceitar pessoa no carimbo**

Em `web/src/lib/agentContext.js`, na função `carimbarContexto`, acrescente os dois campos ao objeto gravado:

```js
    st.setItem(CHAVE, JSON.stringify({
      projectId: projectId ?? null,
      projectName: projectName ?? null,
      taskId: taskId ?? null,
      taskTitle: taskTitle ?? null,
      taskCount: taskCount ?? null,
      personId: personId ?? null,
      personName: personName ?? null,
    }))
```

E na desestruturação da assinatura:

```js
export function carimbarContexto({ projectId, projectName, taskId, taskTitle, taskCount, personId, personName } = {}) {
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd web && npx vitest run src/lib/agentContext.test.js
```

Expected: PASS.

- [ ] **Step 5: Carimbar ao abrir a ficha de uma pessoa**

Em `web/src/pages/PessoasPage.jsx`, importe:

```js
import { carimbarContexto } from '../lib/agentContext'
```

e, no `useEffect` que reage a `selected` (ou logo depois do `setSelected(...)` que abre a ficha), acrescente:

```js
  // Contexto para o chat: quem está na tela agora. Espelha o que
  // ProjectBoardPage.jsx já faz com projeto e tarefa.
  useEffect(() => {
    if (!selected) return
    carimbarContexto({ personId: selected.id, personName: selected.name })
  }, [selected])
```

Confira o formato real de `selected` antes (`grep -n "setSelected(" web/src/pages/PessoasPage.jsx`) — se o objeto for `{ raw, ... }`, use `selected.raw.id` e `selected.raw.name`.

- [ ] **Step 6: Carimbar o projeto ABERTO, não o último visitado**

`ProjectBoardPage.jsx` já carimba, mas a `ProjectPage` é quem sabe qual projeto está aberto agora. Em `web/src/pages/projectBoard/ProjectPage.jsx`, no `useEffect` que já existe e depende de `project?.id`, acrescente ao fim do corpo:

```js
    carimbarContexto({ projectId: project.id, projectName: project.name })
```

com o import:

```js
import { carimbarContexto } from '../../lib/agentContext'
```

- [ ] **Step 7: Rodar tudo**

```bash
cd web && npx vitest run
```

Expected: PASS. 21 arquivos / 165 testes.

- [ ] **Step 8: Conferir no navegador**

Abra a ficha de um cliente em `/pessoas`, depois o painel do chat: o chip de contexto deve citar a pessoa. Entre num projeto e repita: deve citar o projeto.

- [ ] **Step 9: Commit**

```bash
git add web/src/lib/agentContext.js web/src/lib/agentContext.test.js web/src/pages/PessoasPage.jsx web/src/pages/projectBoard/ProjectPage.jsx
git commit -m "feat(web): chat recebe contexto de pessoa e do projeto aberto"
```

---

### Task 6: Verificação final

**Files:** `docs/superpowers/specs/2026-08-18-ajustes-void-a-interface-design.md`

- [ ] **Step 1: Suíte do front**

```bash
cd web && npx vitest run
```

Expected: PASS. 21 arquivos / 165 testes.

- [ ] **Step 2: Suíte da API (nada aqui a tocou, mas confirme)**

```bash
cd src && DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/office_timesheet_test" JWT_SECRET=test-secret npx vitest run
```

Expected: PASS. 133 arquivos / 857 testes.

- [ ] **Step 3: Build**

```bash
cd web && npm run build
```

Expected: sem erro.

- [ ] **Step 4: Aceite do PDF, item 11**

*"Dentro de um projeto, abro o chat pelo botão flutuante, pergunto e volto ao projeto sem perder tela nem conversa."*

Percorra o roteiro da Task 4, Step 7. Os sete itens precisam passar.

- [ ] **Step 5: Fechar o bloco A no spec**

Troque o `**Status:**` do cabeçalho de `docs/superpowers/specs/2026-08-18-ajustes-void-a-interface-design.md` por:

```markdown
**Status:** implementado (planos A1 e A2)
```

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-08-18-ajustes-void-a-interface-design.md
git commit -m "docs: bloco A concluído (itens 9, 10 e 11)"
```
