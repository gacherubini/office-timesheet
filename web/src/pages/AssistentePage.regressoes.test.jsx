/** @vitest-environment jsdom */
// Regressões da extração do AgentContext na página do Assistente: chip de
// contexto e drawer de conversas do mobile.
//
// Fica fora do AssistentePage.test.jsx de propósito: aquele é caracterização da
// página ANTES da extração e suas asserções não mudam.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const listConversations = vi.hoisted(() => vi.fn(async () => ({ items: [] })))
const getConversation = vi.hoisted(() => vi.fn(async () => ({ id: 'c1', messages: [] })))

vi.mock('../lib/agentClient', () => ({
  streamChat: vi.fn(async () => {}),
  executeProposal: vi.fn(async () => ({})),
  cancelProposal: vi.fn(async () => ({})),
  downloadAgentFile: vi.fn(async () => {}),
  listConversations: (...a) => listConversations(...a),
  getConversation: (...a) => getConversation(...a),
  renameConversation: vi.fn(async () => ({ title: 'x' })),
  deleteConversation: vi.fn(async () => ({})),
  avaliarResposta: vi.fn(async () => ({})),
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'u1', name: 'Ana', role: 'employee' } }),
}))

import { AgentProvider } from '../contexts/AgentContext'
import { AssistentePage } from './AssistentePage'

// O provider monta com o app (acima do router); a página entra depois, quando o
// usuário navega. `comPagina: false` reproduz o instante em que só o provider
// está de pé — é aí que o carimbo de outra tela é feito.
function arvore(comPagina) {
  return (
    <MemoryRouter>
      <AgentProvider>{comPagina ? <AssistentePage /> : <div />}</AgentProvider>
    </MemoryRouter>
  )
}

function carimbar(obj) {
  sessionStorage.setItem('assistente:contexto', JSON.stringify(obj))
}

describe('AssistentePage — chip de contexto', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    listConversations.mockResolvedValue({ items: [] })
    getConversation.mockResolvedValue({ id: 'c1', messages: [] })
  })
  afterEach(cleanup)

  // Cenário: /projetos → "Casa Verde" → Assistente. O carimbo é feito muito
  // depois da carga do app; ler uma vez por provider deixaria o chip invisível
  // e a pergunta subiria sem projeto — só voltaria com F5.
  it('mostra o projeto carimbado depois que o app já carregou', async () => {
    const { rerender } = render(arvore(false))
    carimbar({ projectId: 'p-9', projectName: 'Casa Verde' })
    await act(async () => { rerender(arvore(true)) })
    const chip = screen.getByRole('link', { name: 'Casa Verde' })
    expect(chip.getAttribute('href')).toBe('/projetos?project=p-9')
  })

  // Carimbo de PESSOA (PessoasPage): sem o ramo próprio o chip nasceria com
  // texto vazio e link para /projetos.
  it('mostra a pessoa carimbada e aponta para /pessoas', async () => {
    carimbar({
      projectId: null, projectName: null, taskId: null, taskTitle: null,
      taskCount: null, personId: 'u-7', personName: 'Luiz Eduardo',
    })
    await act(async () => { render(arvore(true)) })
    const chip = screen.getByRole('link', { name: 'Luiz Eduardo' })
    expect(chip.getAttribute('href')).toBe('/pessoas')
  })

  it('tarefa continua ganhando do resto do carimbo', async () => {
    carimbar({
      projectId: 'p-9', projectName: 'Casa Verde', taskId: 't-3', taskTitle: 'Fundação',
      personId: 'u-7', personName: 'Luiz Eduardo',
    })
    await act(async () => { render(arvore(true)) })
    const chip = screen.getByRole('link', { name: 'Casa Verde · Fundação' })
    expect(chip.getAttribute('href')).toBe('/tarefas?task=t-3')
  })
})

// O drawer do mobile é a única lista de conversas na tela pequena. Fechá-lo sem
// ter trocado de conversa deixa o usuário olhando a conversa antiga sem pista
// nenhuma do que aconteceu.
describe('AssistentePage — drawer de conversas', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    listConversations.mockResolvedValue({ items: [{ id: 'c-2', title: 'Orçamento da obra', updated_at: new Date().toISOString() }] })
    getConversation.mockResolvedValue({ id: 'c1', messages: [] })
  })
  afterEach(cleanup)

  async function abrirDrawer() {
    await act(async () => { render(arvore(true)) })
    await waitFor(() => expect(screen.getAllByText('Orçamento da obra').length).toBeGreaterThan(0))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Conversas' })) })
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeTruthy()
  }

  it('mantém o drawer aberto quando a conversa não carrega', async () => {
    getConversation.mockRejectedValue(new Error('deu ruim'))
    await abrirDrawer()
    const item = screen.getAllByRole('button', { name: /Orçamento da obra/ })[0]
    await act(async () => { fireEvent.click(item) })
    expect(screen.queryByRole('button', { name: 'Fechar' })).toBeTruthy()
  })

  it('fecha o drawer quando a conversa entra na tela', async () => {
    getConversation.mockResolvedValue({ id: 'c-2', messages: [{ autor: 'user', texto: 'quanto custou?' }] })
    await abrirDrawer()
    const item = screen.getAllByRole('button', { name: /Orçamento da obra/ })[0]
    await act(async () => { fireEvent.click(item) })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Fechar' })).toBeNull())
  })
})
