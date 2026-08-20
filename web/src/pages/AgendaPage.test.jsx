/** @vitest-environment jsdom */
// A /agenda substituiu a /vacation-calendar no menu, mas nasceu mais pobre que
// a tela que aposentou: os prazos das tarefas e os três painéis de "o que vem
// por aí" ficaram para trás. Estes testes são a migração dessas features —
// cada um descreve o que a tela antiga entregava e a nova não.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AgendaPage } from './AgendaPage'

// Quinta-feira. A semana desenhada (domingo a sábado) vai de 16 a 22/08 —
// tudo que os testes colocam em setembro está deliberadamente FORA dela, que
// é a razão de existir dos painéis laterais.
const HOJE = new Date('2026-08-20T09:00:00')

const TAREFAS = [
  {
    id: 't1',
    title: 'Revisar planta baixa',
    due_date: '2026-08-20',
    status: 'in_progress',
    priority: 'high',
    project_name: 'Residência Aurora',
    description: 'Conferir as cotas do pavimento térreo.',
  },
  // Prazo dentro da semana, mas já resolvida: não deve ocupar espaço no dia.
  { id: 't2', title: 'Comprar cimento', due_date: '2026-08-21', status: 'done', priority: 'low' },
  { id: 't3', title: 'Orçamento antigo', due_date: '2026-08-19', status: 'abandoned', priority: 'low' },
  // Sem prazo: não tem dia onde cair.
  { id: 't4', title: 'Tarefa solta', due_date: null, status: 'todo', priority: 'medium' },
]

const EVENTOS = [
  { id: 'e1', title: 'Reunião de obra', start: '2026-08-20T14:00:00', end: '2026-08-20T15:00:00', source: 'office', all_day: false },
  // Fora da semana visível — só o painel dos próximos 90 dias alcança.
  { id: 'e2', title: 'Visita ao cliente', start: '2026-10-01T10:00:00', end: '2026-10-01T11:00:00', source: 'office', all_day: false },
  { id: 'e3', title: 'Consulta médica', start: '2026-09-15T08:00:00', end: '2026-09-15T09:00:00', source: 'google', all_day: false },
  { id: 'e4', title: 'Independência', start: '2026-09-07T00:00:00', end: '2026-09-07T23:59:00', source: 'holiday', all_day: true },
]

const FERIAS = [
  {
    id: 'v1',
    start_date: '2026-08-17',
    end_date: '2026-08-21',
    days_count: 5,
    status: 'approved',
    profile: { name: 'Bruno Salles' },
  },
]

const FERIADOS = [
  { date: '2026-09-07', name: 'Independência' },
  { date: '2026-10-12', name: 'Nossa Senhora Aparecida' },
  // Já passou: o painel é do que VEM.
  { date: '2026-06-11', name: 'Corpus Christi' },
]

const apiMock = { get: vi.fn(), post: vi.fn(), delete: vi.fn() }
const conectado = { valor: true }

vi.mock('../lib/api', () => ({
  get api() { return apiMock },
}))

// O intervalo pedido é o que separa o calendário (semana/mês visível) dos
// painéis laterais (90 dias). O mock filtra a mesma lista pelos dois, senão o
// teste não distinguiria "aparece no painel" de "aparece em tudo".
vi.mock('../lib/calendarClient', () => ({
  getCalendarStatus: () => Promise.resolve({ connected: conectado.valor }),
  getCalendarEvents: (inicio, fim) =>
    Promise.resolve({
      events: EVENTOS.filter((e) => e.start.slice(0, 10) >= inicio && e.start.slice(0, 10) <= fim),
    }),
}))

vi.mock('../lib/holidaysClient', () => ({
  fetchHolidays: (ano) => Promise.resolve(FERIADOS.filter((h) => h.date.startsWith(String(ano)))),
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'u1', name: 'Ana Prado' } }),
}))

// Fala com o OAuth do Google; fora de foco aqui.
vi.mock('./profile/CalendarConnect', () => ({ CalendarConnect: () => null }))

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(HOJE)
  conectado.valor = true
  apiMock.get.mockImplementation((url) => {
    if (url.startsWith('/vacation-calendar')) return Promise.resolve(FERIAS)
    if (url.startsWith('/presences')) return Promise.resolve([])
    if (url.startsWith('/tasks')) return Promise.resolve(TAREFAS)
    return Promise.resolve([])
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

function montar() {
  render(
    <MemoryRouter>
      <AgendaPage />
    </MemoryRouter>,
  )
}

// O cartão inteiro (cabeçalho + corpo) a partir do seu título, para que
// "aparece no painel X" não seja satisfeito por um texto de outro lugar.
function painel(nome) {
  const titulo = screen.getByRole('heading', { name: nome })
  return titulo.closest('div').parentElement
}

const grade = () => document.querySelector('[data-testid="agenda-grade"]')

describe('AgendaPage — prazos das minhas tarefas', () => {
  it('o prazo cai no dia, dentro do calendário', async () => {
    montar()
    await waitFor(() => expect(within(grade()).getByText(/Revisar planta baixa/)).toBeTruthy())
  })

  it('tarefa concluída ou abandonada não ocupa o dia', async () => {
    montar()
    await waitFor(() => expect(within(grade()).getByText(/Revisar planta baixa/)).toBeTruthy())

    expect(within(grade()).queryByText(/Comprar cimento/)).toBeNull()
    expect(within(grade()).queryByText(/Orçamento antigo/)).toBeNull()
  })

  it('tarefa sem prazo não tem dia onde aparecer', async () => {
    montar()
    await waitFor(() => expect(within(grade()).getByText(/Revisar planta baixa/)).toBeTruthy())

    expect(within(grade()).queryByText(/Tarefa solta/)).toBeNull()
  })

  // Os prazos entram pela porta que a tela já tem: são uma camada, como
  // Pessoal e Escritório, e não uma exceção sem interruptor.
  it('a camada de tarefas desliga junto com as outras', async () => {
    montar()
    await waitFor(() => expect(within(grade()).getByText(/Revisar planta baixa/)).toBeTruthy())

    fireEvent.click(screen.getByLabelText(/minhas tarefas/i))

    await waitFor(() => expect(within(grade()).queryByText(/Revisar planta baixa/)).toBeNull())
  })

  it('clicar no prazo abre a tarefa e oferece o caminho para o quadro', async () => {
    montar()
    await waitFor(() => expect(within(grade()).getByText(/Revisar planta baixa/)).toBeTruthy())

    fireEvent.click(within(grade()).getByText(/Revisar planta baixa/))

    // Pelo título, e não por role="dialog": o Modal do design system não
    // publica esse papel (lacuna de acessibilidade dele, anotada à parte) —
    // inventar aqui um seletor que a tela não oferece daria um teste verde
    // sobre uma coisa que não existe.
    const dialogo = await waitFor(() => painel('Revisar planta baixa'))
    expect(within(dialogo).getByText('Residência Aurora')).toBeTruthy()
    expect(within(dialogo).getByText(/em andamento/i)).toBeTruthy()
    expect(within(dialogo).getByText(/prioridade: alta/i)).toBeTruthy()
    expect(within(dialogo).getByRole('button', { name: /abrir no quadro/i })).toBeTruthy()
  })
})

// A razão de os painéis existirem: o calendário só mostra o intervalo
// navegado. Na semana de hoje ninguém enxerga o feriado de daqui a três
// semanas — e era isso que a tela antiga resolvia.
describe('AgendaPage — o que vem por aí, além do intervalo visível', () => {
  it('feriado fora da semana visível aparece no painel de próximos', async () => {
    montar()
    await waitFor(() => expect(within(painel(/próximos feriados/i)).getByText('Independência')).toBeTruthy())

    // A prova de que o painel fura o intervalo: no calendário ele não está.
    expect(within(grade()).queryByText('Independência')).toBeNull()
  })

  it('o painel de feriados ignora o que já passou', async () => {
    montar()
    await waitFor(() => expect(within(painel(/próximos feriados/i)).getByText('Independência')).toBeTruthy())

    expect(within(painel(/próximos feriados/i)).queryByText('Corpus Christi')).toBeNull()
  })

  it('compromisso do escritório nos próximos 90 dias aparece no painel', async () => {
    montar()
    await waitFor(() =>
      expect(within(painel(/agenda do escritório/i)).getByText('Visita ao cliente')).toBeTruthy(),
    )
    expect(within(grade()).queryByText('Visita ao cliente')).toBeNull()
  })

  it('evento pessoal nos próximos 90 dias aparece no painel', async () => {
    montar()
    await waitFor(() =>
      expect(within(painel(/próximos eventos/i)).getByText('Consulta médica')).toBeTruthy(),
    )
  })

  // Painel vazio por falta de conexão não é o mesmo que agenda vazia: quem
  // nunca conectou precisa saber que o problema é esse.
  it('sem Google conectado, o painel de eventos diz o que fazer', async () => {
    conectado.valor = false
    montar()
    await waitFor(() =>
      expect(within(painel(/próximos eventos/i)).getByText(/conecte sua agenda google/i)).toBeTruthy(),
    )
  })
})

// O chip no dia diz QUEM está de férias; não diz até quando nem quantos dias.
// Para saber isso na tela nova era preciso voltar para a antiga.
describe('AgendaPage — férias do período', () => {
  it('resume nome, intervalo e quantidade de dias', async () => {
    montar()
    const cartao = await waitFor(() => painel(/férias no período/i))

    await waitFor(() => expect(within(cartao).getByText('Bruno Salles')).toBeTruthy())
    expect(within(cartao).getByText(/17\/08\/2026.*21\/08\/2026/)).toBeTruthy()
    expect(within(cartao).getByText(/5 dias/)).toBeTruthy()
  })
})
