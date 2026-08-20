/** @vitest-environment jsdom */
// O "Ver tudo" do cartão levava à /vacation-calendar — a tela de calendário
// que a /agenda aposentou e que não está mais no menu. Era o único link para
// ela em todo o app: quem clicava saía da navegação nova sem perceber, e
// chegava numa tela sem o item "Agenda" aceso no topo.
//
// Este teste só pôde vir depois da migração das features (prazos de tarefa e
// os painéis de próximos): antes dela, apontar o link para a /agenda tiraria
// coisas de quem clicasse.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AgendaCard } from './AgendaCard'

const conectado = { valor: true }

vi.mock('../lib/calendarClient', () => ({
  getCalendarStatus: () => Promise.resolve({ connected: conectado.valor }),
  getCalendarEvents: () =>
    Promise.resolve({
      events: [
        { id: 'e1', title: 'Reunião de obra', start: '2026-08-21T14:00:00', source: 'google' },
      ],
    }),
}))

beforeEach(() => {
  conectado.valor = true
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AgendaCard', () => {
  it('"Ver tudo" abre a agenda nova', async () => {
    render(
      <MemoryRouter>
        <AgendaCard />
      </MemoryRouter>,
    )

    const link = await waitFor(() => screen.getByRole('link', { name: /ver tudo/i }))
    expect(link.getAttribute('href')).toBe('/agenda')
  })
})
