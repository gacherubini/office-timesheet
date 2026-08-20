/** @vitest-environment jsdom */
// A lista de projetos do painel tem seta de "entrar" em cada linha, mas as
// quatro linhas levavam ao MESMO lugar: a aba de projetos, com o catálogo
// aberto e nada escolhido. Quem clicou em "Residência Aurora" tinha que
// procurar "Residência Aurora" de novo na tela seguinte — a seta prometia
// destino e entregava lista.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { EmployeeDashboardPage } from './EmployeeDashboardPage'

const PROJETOS = [
  { id: 'p-aurora', name: 'Residência Aurora', client: 'Construtora Aurora', status: 'active' },
  { id: 'p-itaim', name: 'Reforma Itaim', client: 'Marcos Aurélio', status: 'active' },
]

const apiMock = { get: vi.fn() }

vi.mock('../lib/api', () => ({
  get api() { return apiMock },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { name: 'Ana Prado' } }),
}))

// Os cartões vizinhos buscam sozinhos e desenham os próprios links — o
// MyTasksTimer inclusive aponta para /project-board. Nada disso está em jogo
// aqui, e deixá-los de pé só embaralharia a busca por link.
vi.mock('../components/BirthdayCalendar', () => ({ BirthdayCalendar: () => null }))
vi.mock('../components/AgendaCard', () => ({ AgendaCard: () => null }))
vi.mock('../components/MyTasksTimer', () => ({ MyTasksTimer: () => null }))

beforeEach(() => {
  apiMock.get.mockImplementation((url) => {
    if (url === '/projects') return Promise.resolve(PROJETOS.map((p) => ({ ...p })))
    if (url === '/me/stats') return Promise.resolve({ project_count: 2, project_breakdown: [] })
    if (url === '/me/active-timer') return Promise.resolve(null)
    return Promise.resolve(null)
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function montar() {
  render(
    <MemoryRouter>
      <EmployeeDashboardPage />
    </MemoryRouter>,
  )
}

const linhaDe = (nome) => screen.getByRole('link', { name: new RegExp(nome) })

describe('EmployeeDashboardPage — a lista de projetos', () => {
  it('leva ao projeto clicado, já aberto', async () => {
    montar()
    await waitFor(() => expect(linhaDe('Residência Aurora')).toBeTruthy())

    // ?project=<id> é o deep-link que o ProjectBoardPage já entende (a URL é a
    // fonte da verdade do projeto aberto). E /projetos, não /project-board: as
    // duas rotas desenham a mesma página, mas o isActive do Topbar compara o
    // caminho exato — pela rota legada a pessoa chega ao projeto com o menu
    // "Projetos" apagado, sem saber em que aba está.
    expect(linhaDe('Residência Aurora').getAttribute('href')).toBe(
      '/projetos?project=p-aurora',
    )
  })

  // Guarda contra o conserto pela metade: apontar todas as linhas para o
  // primeiro id passaria no teste de cima e continuaria abrindo o projeto
  // errado a partir da segunda linha.
  it('cada linha leva ao seu próprio projeto', async () => {
    montar()
    await waitFor(() => expect(linhaDe('Reforma Itaim')).toBeTruthy())

    expect(linhaDe('Reforma Itaim').getAttribute('href')).toBe('/projetos?project=p-itaim')
  })

  // E contra o conserto demais: o "Ver projetos" do cabeçalho é justamente o
  // caminho para a lista inteira — ele deve continuar sem projeto nenhum.
  it('"Ver projetos" continua abrindo a lista, sem escolher por conta própria', async () => {
    montar()
    await waitFor(() => expect(screen.getByRole('link', { name: /ver projetos/i })).toBeTruthy())

    expect(screen.getByRole('link', { name: /ver projetos/i }).getAttribute('href')).toBe(
      '/projetos',
    )
  })
})
