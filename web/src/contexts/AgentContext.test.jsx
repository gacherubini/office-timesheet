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

// Perfil mutável: o provider vive ACIMA do router e não desmonta no logout, então
// o único jeito de reproduzir "logout + outro login na mesma aba" é trocar o que
// o useAuth devolve e re-renderizar, como o AuthProvider faz de verdade.
const perfil = vi.hoisted(() => ({ atual: { id: 'u1', name: 'Ana', role: 'employee' } }))

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ profile: perfil.atual }),
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
    perfil.atual = { id: 'u1', name: 'Ana', role: 'employee' }
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

  // Os dois testes abaixo cobrem o ramo de abort de `correr()`, o mais
  // arriscado da extração (mexe em duas formas diferentes de mensagens
  // dependendo do que já foi pintado na bolha) e o único sem cobertura até
  // aqui. Simulamos o abort do jeito que o código real reconhece: o
  // streamChat rejeita com um erro `name: 'AbortError'` (é isso que o fetch
  // real produz quando o AbortController dispara).
  it('interromper com a bolha já com texto pintado acrescenta "Interrompido" ao que já apareceu', async () => {
    streamChat.mockImplementationOnce(async ({ onEvent }) => {
      // `empurrar` pinta de forma síncrona (primeiro tick sem timer pendente),
      // então a bolha já tem texto quando o abort chega logo em seguida —
      // é exatamente essa ordem que separa este caso do próximo.
      onEvent({ type: 'token', text: 'Olá' })
      const err = new Error('abortado')
      err.name = 'AbortError'
      throw err
    })
    montar()
    await act(async () => { await api.enviar('oi') })
    // A lista continua com as duas bolhas: interromper com texto não some com nada.
    expect(screen.getByTestId('qtd').textContent).toBe('2')
    expect(api.mensagens[1].texto).toContain('Ol')
    expect(api.mensagens[1].texto).toContain('Interrompido')
  })

  it('interromper com a bolha ainda vazia remove a bolha do bot em vez de deixar uma bolha em branco', async () => {
    streamChat.mockImplementationOnce(async () => {
      // Nenhum token chega antes do abort — a bolha do bot nasceu com
      // texto: '' e segue assim até o catch.
      const err = new Error('abortado')
      err.name = 'AbortError'
      throw err
    })
    montar()
    await act(async () => { await api.enviar('oi') })
    // Sem a bolha do bot: sobra só a pergunta do usuário.
    expect(screen.getByTestId('qtd').textContent).toBe('1')
    expect(api.mensagens[0].autor).toBe('user')
  })

  // Caminho 2: quem segura a guarda de "nada pra enviar" é o contexto, não a
  // view — `enviar('')` precisa distinguir "vazio de verdade" de "vazio mas
  // com anexo".
  it('enviar com texto vazio e arquivo anexado ainda dispara o streamChat com o arquivo', async () => {
    montar()
    const arquivo = new File(['x'], 'a.txt')
    await act(async () => { api.setArquivo(arquivo) })
    await act(async () => { await api.enviar('') })
    expect(streamChat).toHaveBeenCalledTimes(1)
    expect(streamChat.mock.calls[0][0].file).toBe(arquivo)
  })

  // Nota: "enviar vazio sem arquivo não faz nada" já existia (teste "enviar
  // texto vazio não faz nada", com '   ' — cai no mesmo trim() que ''), então
  // não duplicamos aqui.

  // ── Ciclo de vida do dono ────────────────────────────────────────────────
  // Máquina compartilhada: admin pergunta o custo do time, desloga, colaborador
  // loga na mesma aba e abre o chat. O provider NÃO desmonta no logout (Topbar
  // navega para /login, não recarrega), então a conversa só some se alguém
  // zerar de propósito. Antes da extração o unmount da página fazia isso.
  it('a conversa não sobrevive à troca de dono na mesma aba', async () => {
    listConversations.mockResolvedValue({ items: [{ id: 'c1', title: 'Custo do time' }] })
    const { rerender } = montar()
    await act(async () => { await api.enviar('qual o custo do time este mês?') })
    expect(screen.getByTestId('qtd').textContent).toBe('2')
    await waitFor(() => expect(api.itens.length).toBe(1))

    // logout: o AuthProvider zera o profile, o AgentProvider continua montado.
    perfil.atual = null
    await act(async () => { rerender(<AgentProvider><Sonda /></AgentProvider>) })
    expect(screen.getByTestId('qtd').textContent).toBe('0')
    expect(api.mensagens).toEqual([])
    expect(api.itens).toEqual([])

    // outro usuário loga na mesma aba
    perfil.atual = { id: 'u2', name: 'Bruno', role: 'employee' }
    await act(async () => { rerender(<AgentProvider><Sonda /></AgentProvider>) })
    expect(screen.getByTestId('qtd').textContent).toBe('0')
    expect(JSON.stringify(api.mensagens)).not.toContain('custo do time')
  })

  // Regressão: `donoRestauradoRef.current !== dono` dentro do `.then` de
  // restauração existe para o caso do dono trocar ENQUANTO o GET de
  // restauração ainda está em voo. Sem a guarda, a resposta atrasada do GET
  // do dono ANTIGO pintaria a conversa dele por cima do dono NOVO já logado.
  it('GET de restauração em voo não escreve a conversa do dono antigo se o dono trocou antes de resolver', async () => {
    // Sessão salva de u1 (v2, formato real de agentSession.js) para o efeito
    // de montagem disparar o GET de restauração.
    localStorage.setItem('assistente:sessao', JSON.stringify({
      v: 2, userId: 'u1', conversationId: 'c-antigo', updatedAt: Date.now(),
    }))
    let resolverGet
    getConversation.mockImplementationOnce(() => new Promise((resolve) => { resolverGet = resolve }))

    const { rerender } = montar()
    await waitFor(() => expect(getConversation).toHaveBeenCalledWith('c-antigo'))

    // Dono troca ENQUANTO o GET de u1 ainda está em voo. u2 não tem sessão
    // salva, então não dispara um segundo GET — sobra só o de u1 pendente.
    perfil.atual = { id: 'u2', name: 'Bruno', role: 'employee' }
    await act(async () => { rerender(<AgentProvider><Sonda /></AgentProvider>) })
    expect(screen.getByTestId('qtd').textContent).toBe('0')

    // Só agora o GET atrasado do dono antigo resolve.
    await act(async () => {
      resolverGet({ id: 'c-antigo', messages: [{ autor: 'bot', texto: 'segredo do dono antigo' }] })
      await Promise.resolve()
      await Promise.resolve()
    })

    // A conversa do dono antigo não pode ter sido escrita por cima do dono novo.
    expect(JSON.stringify(api.mensagens)).not.toContain('segredo do dono antigo')
    expect(screen.getByTestId('conversa').textContent).not.toBe('c-antigo')
  })

  it('trocar direto de dono (sem passar por null) também zera a conversa', async () => {
    const { rerender } = montar()
    await act(async () => { await api.enviar('meu salário') })
    expect(screen.getByTestId('qtd').textContent).toBe('2')
    perfil.atual = { id: 'u2', name: 'Bruno', role: 'employee' }
    await act(async () => { rerender(<AgentProvider><Sonda /></AgentProvider>) })
    expect(screen.getByTestId('qtd').textContent).toBe('0')
  })

  // ── Contexto da página aberta ────────────────────────────────────────────
  // O carimbo é feito por OUTRA tela depois que o provider já montou. Ler uma
  // vez por carga do app faz a pergunta subir com context: null.
  it('relerContexto pega o carimbo feito depois da montagem do provider', async () => {
    montar()
    // /projetos carimba agora — o provider já está montado há tempo.
    sessionStorage.setItem('assistente:contexto', JSON.stringify({
      projectId: 'p-9', projectName: 'Casa Verde',
    }))
    act(() => { api.relerContexto() })
    expect(api.contextoAtivo?.projectName).toBe('Casa Verde')
    await act(async () => { await api.enviar('quantas horas nesse projeto?') })
    expect(streamChat.mock.calls[0][0].context?.projectId).toBe('p-9')
  })

  // ── interromper() ────────────────────────────────────────────────────────
  // Única linha escrita à mão da extração. O mock resolve sozinho em 20ms se
  // ninguém abortar, para a falha ser uma asserção e não um timeout.
  it('interromper aborta o turno em andamento', async () => {
    let sinal = null
    streamChat.mockImplementationOnce(({ signal, onEvent }) => new Promise((resolve, reject) => {
      sinal = signal
      onEvent({ type: 'token', text: 'Olá' })
      const err = new Error('abortado')
      err.name = 'AbortError'
      if (signal.aborted) return reject(err)
      signal.addEventListener('abort', () => reject(err))
      setTimeout(resolve, 20)
      return undefined
    }))
    montar()
    await act(async () => {
      const p = api.enviar('me escreve um relatório enorme')
      api.interromper()
      await p
    })
    expect(sinal?.aborted).toBe(true)
    expect(api.mensagens[1].texto).toContain('Interrompido')
  })

  // Minor 6: com página montada e painel aberto por cima, o cleanup de um não
  // pode apagar o registro do outro.
  it('desregistrar o scroll de uma view não apaga o registro de outra', async () => {
    const daPagina = vi.fn()
    const doPainel = vi.fn()
    montar()
    let soltarPagina
    act(() => { soltarPagina = api.registrarScroll({ pertoDoFundo: () => true, rolarParaFim: daPagina }) })
    act(() => { api.registrarScroll({ pertoDoFundo: () => true, rolarParaFim: doPainel }) })
    // A página desmonta depois do painel ter assumido: o registro é do painel.
    act(() => { soltarPagina() })
    await act(async () => { await api.enviar('oi') })
    await waitFor(() => expect(doPainel).toHaveBeenCalled())
    expect(daPagina).not.toHaveBeenCalled()
  })
})
