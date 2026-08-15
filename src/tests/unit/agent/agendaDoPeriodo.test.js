import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as events from '../../../lib/calendar/events.js'

const profile = { id: 'u1', role: 'employee' }

describe('agenda_do_periodo — parâmetros', () => {
  it('recusa periodo e inicio juntos', async () => {
    const tool = (await import('../../../lib/agent/tools/read/agendaDoPeriodo.js')).default
    await expect(tool.run(profile, {
      periodo: 'hoje', inicio: '2026-08-15', fim: '2026-08-15',
    })).rejects.toThrow(/recorte|período|periodo/i)
  })

  it('recusa inicio sem fim', async () => {
    const tool = (await import('../../../lib/agent/tools/read/agendaDoPeriodo.js')).default
    await expect(tool.run(profile, { inicio: '2026-08-15' })).rejects.toThrow()
  })

  it('recusa intervalo com mais de 31 dias inclusivos', async () => {
    const tool = (await import('../../../lib/agent/tools/read/agendaDoPeriodo.js')).default
    await expect(tool.run(profile, {
      inicio: '2026-08-01', fim: '2026-09-01', // 32 dias
    })).rejects.toThrow(/31/)
  })

  it('schema não tem parâmetro de pessoa', async () => {
    const tool = (await import('../../../lib/agent/tools/read/agendaDoPeriodo.js')).default
    const props = tool.definition.function.parameters.properties
    expect(props.user_id).toBeUndefined()
    expect(props.pessoa).toBeUndefined()
    expect(props.nome).toBeUndefined()
  })
})

describe('agenda_do_periodo — janelas nomeadas (sem iCal)', () => {
  let tool

  beforeEach(async () => {
    tool = (await import('../../../lib/agent/tools/read/agendaDoPeriodo.js')).default
    vi.spyOn(events, 'listEventsForUser').mockResolvedValue({ events: [], calendar_error: false })
    vi.spyOn(events, 'isCalendarConnected').mockResolvedValue(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function diasDaChamada() {
    const [, start, end] = events.listEventsForUser.mock.calls[0]
    const ymd = (d) => {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
    return Math.round((Date.parse(`${ymd(end)}T00:00:00Z`) - Date.parse(`${ymd(start)}T00:00:00Z`)) / 86400000) + 1
  }

  // 2026-08-15T15:00:00Z = 12:00 em America/Sao_Paulo
  const now = new Date('2026-08-15T15:00:00Z')

  it.each(['hoje', 'amanha', 'semana', 'mes'])(
    '%s resolve para um intervalo ≤ 31 dias',
    async (periodo) => {
      await tool.run(profile, { periodo }, now)
      expect(events.listEventsForUser).toHaveBeenCalledTimes(1)
      expect(diasDaChamada()).toBeLessThanOrEqual(31)
    },
  )

  it('aceita exatamente 31 dias inclusivos', async () => {
    await expect(tool.run(profile, { inicio: '2026-08-01', fim: '2026-08-31' })).resolves.toBeDefined()
    expect(diasDaChamada()).toBe(31)
  })

  it('mapeia campos da rota e omite id e description', async () => {
    events.listEventsForUser.mockResolvedValue({
      events: [{
        id: 'evt-1',
        title: 'Reunião',
        start: '2026-08-16T13:00:00.000Z',
        end: '2026-08-16T14:00:00.000Z',
        all_day: false,
        location: 'Meet',
        description: 'secreto',
        source: 'google',
      }],
      calendar_error: false,
    })
    events.isCalendarConnected.mockResolvedValue(true)
    const result = await tool.run(profile, { inicio: '2026-08-16', fim: '2026-08-16' })
    expect(result).toEqual({
      data: [{
        titulo: 'Reunião',
        inicio: '2026-08-16T13:00:00.000Z',
        fim: '2026-08-16T14:00:00.000Z',
        dia_todo: false,
        local: 'Meet',
        fonte: 'google',
      }],
      count: 1,
      conectado: true,
      calendar_error: false,
    })
    expect(result.data[0].id).toBeUndefined()
    expect(result.data[0].description).toBeUndefined()
  })
})
