import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { ensureRoRole } from '../../helpers/roDb.js'
import { makeUser } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/sql/consultarDados.js'

describe('tool consultar_dados (admin, SQL restrito)', () => {
  let admin
  beforeAll(async () => {
    await ensureRoRole()
  })
  beforeEach(async () => {
    await resetDb()
    admin = await makeUser({ role: 'admin', name: 'Chefe' })
    await makeUser({ role: 'employee', name: 'Ana' })
    await makeUser({ role: 'employee', name: 'Bruno' })
  })

  it('roda um SELECT válido pela role read-only e devolve linhas', async () => {
    const { data, count } = await tool.run(admin, {
      sql: 'SELECT name FROM users ORDER BY name',
    })
    const nomes = data.map((r) => r.name)
    expect(nomes).toEqual(['Ana', 'Bruno', 'Chefe'])
    expect(count).toBe(3)
  })

  it('recusa um verbo que não é SELECT com erro claro (não vaza interno)', async () => {
    await expect(tool.run(admin, { sql: `DELETE FROM users` })).rejects.toThrow(/SQL recusado/i)
  })

  it('respeita o statement_timeout (consulta longa é cortada)', async () => {
    // pg_sleep(4s) > statementTimeoutMs padrão (3000ms) → cancelada pelo Postgres.
    await expect(tool.run(admin, { sql: 'SELECT pg_sleep(4)' })).rejects.toThrow(
      /statement timeout|canceling|cancel/i,
    )
  }, 20000)
})
