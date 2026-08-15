import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeProject } from '../../helpers/factories.js'
import { resolverTarefa } from '../../../lib/agent/tools/tarefas.js'

describe('resolverTarefa', () => {
  let acme
  beforeEach(async () => {
    await resetDb()
    acme = await makeProject({ name: 'Acme' })
    await query(`INSERT INTO tasks (project_id, title, status, position) VALUES ($1,'Logo','todo',0), ($1,'Logo site','in_progress',1)`, [acme.id])
  })
  it('sem nome pergunta o título', async () => {
    await expect(resolverTarefa('')).rejects.toThrow(/qual tarefa/i)
  })
  it('0 resultados', async () => {
    await expect(resolverTarefa('Inexistente')).rejects.toThrow(/não encontrei/i)
  })
  it('2+ pede para especificar', async () => {
    await expect(resolverTarefa('Logo')).rejects.toThrow(/mais de um|especifique/i)
  })
  it('com projeto filtra e devolve status', async () => {
    const t = await resolverTarefa('Logo site', { projeto: 'Acme' })
    expect(t.title).toBe('Logo site')
    expect(t.status).toBe('in_progress')
    expect(t.project_id).toBe(acme.id)
  })
})
