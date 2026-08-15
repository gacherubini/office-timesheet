import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../../helpers/db.js'
import { asUser } from '../../helpers/api.js'
import { makeUser } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/read/agendaDoPeriodo.js'

describe('paridade agenda_do_periodo ↔ GET /me/calendar/events', () => {
  let emp
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee' })
  })

  it('os eventos mapeados da tool batem com a rota no mesmo intervalo', async () => {
    const inicio = '2026-08-15'
    const fim = '2026-08-16'
    const rota = await asUser(emp).get(`/me/calendar/events?start=${inicio}&end=${fim}`)
    expect(rota.status).toBe(200)
    const { data, calendar_error } = await tool.run(emp, { inicio, fim })
    const mapeados = rota.body.events.map((ev) => ({
      titulo: ev.title, inicio: ev.start, fim: ev.end,
      dia_todo: ev.all_day, local: ev.location, fonte: ev.source,
    }))
    expect(data).toEqual(mapeados)
    expect(calendar_error).toBe(rota.body.calendar_error)
  })
})
