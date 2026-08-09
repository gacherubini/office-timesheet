import { describe, it, expect, beforeAll } from 'vitest'
import { ensureRoRole } from '../../helpers/roDb.js'
import { runReadOnly } from '../../../lib/agent/tools/sql/roPool.js'

describe('role read-only agent_readonly (garantia física)', () => {
  beforeAll(async () => {
    await ensureRoRole() // ALTER ROLE + define AGENT_READONLY_DATABASE_URL
  })

  it('consegue LER uma tabela da allowlist', async () => {
    const rows = await runReadOnly('SELECT count(*) AS c FROM users')
    expect(rows[0]).toHaveProperty('c')
  })

  it('NÃO consegue escrever, mesmo mandando um INSERT direto', async () => {
    await expect(
      runReadOnly(`INSERT INTO projects (name, status) VALUES ('x', 'active')`),
    ).rejects.toThrow(/read-only|permission denied|somente leitura|only/i)
  })

  it('NÃO consegue ler tabela fora da allowlist (sem privilégio)', async () => {
    await expect(runReadOnly('SELECT * FROM notifications')).rejects.toThrow(
      /permission denied|não|denied/i,
    )
  })
})
