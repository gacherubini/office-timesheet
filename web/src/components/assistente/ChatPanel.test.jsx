/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const streamChat = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('../../lib/agentClient', () => ({
  streamChat: (...a) => streamChat(...a),
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

function arvore(props = {}) {
  return (
    <MemoryRouter>
      <AgentProvider>
        <ChatPanel aberto onFechar={() => {}} {...props} />
      </AgentProvider>
    </MemoryRouter>
  )
}

function montar(props = {}) {
  return render(arvore(props))
}

// Digita e manda pelo botão de enviar (type=submit dentro do form).
async function perguntar(texto = 'oi') {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: texto } })
  await act(async () => { fireEvent.click(screen.getByLabelText('Enviar')) })
}

describe('ChatPanel', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    streamChat.mockReset()
    streamChat.mockImplementation(async () => {})
  })
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

  // O carimbo é feito por outra tela (projeto/tarefa/pessoa) DEPOIS que o
  // provider montou junto com o app. Por isso o painel relê ao abrir: sem isso
  // a pergunta sobe com context: null e o modelo não sabe de que projeto se fala.
  it('abrir o painel relê o contexto carimbado depois da carga do app', async () => {
    const { rerender } = render(arvore({ aberto: false }))
    sessionStorage.setItem('assistente:contexto', JSON.stringify({
      projectId: 'p-9', projectName: 'Casa Verde',
    }))
    await act(async () => { rerender(arvore({ aberto: true })) })
    await perguntar('quantas horas nesse projeto?')
    expect(streamChat.mock.calls[0][0].context?.projectId).toBe('p-9')
  })

  // Limite diário grava `aviso`, não `erro`: sem renderizar, a bolha fica em branco.
  it('mostra o aviso do limite diário em vez de uma bolha vazia', async () => {
    streamChat.mockImplementationOnce(async () => {
      const err = new Error('Você atingiu o limite de hoje.')
      err.code = 'limite_diario'
      throw err
    })
    montar()
    await perguntar('e aí')
    await waitFor(() => expect(document.body.textContent).toContain('Você atingiu o limite de hoje.'))
  })

  // Proposta pendente: o painel não aprova, mas não pode esconder que existe
  // algo a decidir — senão expira em 5 min sem o usuário entender o silêncio.
  it('avisa que há proposta a confirmar e leva para a tela cheia', async () => {
    streamChat.mockImplementationOnce(async ({ onEvent }) => {
      onEvent({ type: 'proposal', proposalId: 'pr1', descricao: 'Pedir férias de 10 a 20/09', dados: {} })
    })
    montar()
    await perguntar('quero pedir férias')
    await waitFor(() => expect(document.body.textContent).toContain('Pedir férias de 10 a 20/09'))
    expect(screen.getByRole('link', { name: /aprovar/i }).getAttribute('href')).toBe('/assistente')
  })

  // Parar no painel: sem ele, uma resposta longa só se interrompe indo até
  // /assistente. É o mesmo turno — o AbortController vive no contexto.
  it('mostra Parar enquanto responde e o clique aborta o turno', async () => {
    let sinal = null
    streamChat.mockImplementationOnce(({ signal, onEvent }) => new Promise((resolve, reject) => {
      sinal = signal
      onEvent({ type: 'token', text: 'Olá' })
      const err = new Error('abortado')
      err.name = 'AbortError'
      signal.addEventListener('abort', () => reject(err))
      setTimeout(resolve, 20)
    }))
    montar()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'me escreve um relatório' } })
    fireEvent.click(screen.getByLabelText('Enviar'))
    const parar = await screen.findByLabelText('Parar')
    await act(async () => {
      fireEvent.click(parar)
      await new Promise((r) => { setTimeout(r, 30) })
    })
    expect(sinal?.aborted).toBe(true)
    await waitFor(() => expect(document.body.textContent).toContain('Interrompido'))
  })
})
