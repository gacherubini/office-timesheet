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
    // Precisa de FROM: consulta sem tabela nenhuma o guard já recusa antes.
    await expect(
      tool.run(admin, { sql: 'SELECT pg_sleep(4) FROM users LIMIT 1' }),
    ).rejects.toThrow(/demorou demais|cancelada/i)
  }, 20000)

  it('erro do banco chega resumido — sem revelar colunas do schema', async () => {
    const erro = await tool.run(admin, { sql: 'SELECT coluna_que_nao_existe FROM users' })
      .then(() => null, (e) => e)
    expect(erro).toBeTruthy()
    expect(erro.message).toMatch(/SQL falhou/i)
    expect(erro.message).not.toMatch(/does not exist|perhaps you meant|password_hash/i)
  })

  it('CTE de leitura funciona ponta a ponta', async () => {
    const { data } = await tool.run(admin, {
      sql: `WITH gente AS (SELECT name FROM users) SELECT name FROM gente ORDER BY name`,
    })
    expect(data.map((r) => r.name)).toEqual(['Ana', 'Bruno', 'Chefe'])
  })
})
