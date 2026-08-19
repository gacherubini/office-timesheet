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

import { AgentProvider } from '../contexts/AgentContext'
import { AssistentePage } from './AssistentePage'

// Único ajuste permitido pela refatoração: o estado saiu da página e vive no
// provider. Nenhuma asserção mudou.
function renderizar() {
  return render(
    <MemoryRouter>
      <AgentProvider>
        <AssistentePage />
      </AgentProvider>
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
