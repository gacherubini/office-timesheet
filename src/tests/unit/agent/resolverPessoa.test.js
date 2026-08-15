import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser } from '../../helpers/factories.js'
import { resolverPessoa } from '../../../lib/agent/tools/pessoas.js'

describe('resolverPessoa', () => {
  beforeEach(async () => {
    await resetDb()
    await makeUser({ role: 'employee', name: 'Ana Silva' })
    const inativa = await makeUser({ role: 'employee', name: 'Ana Inativa', is_active: false })
    await query('UPDATE users SET deleted_at = now() WHERE name = $1', ['Ana Inativa'])
    void inativa
    await makeUser({ role: 'employee', name: 'Ana Costa' })
  })
  it('deleted/inativa não resolve; 2 Anas pede especificar', async () => {
    await expect(resolverPessoa('Ana')).rejects.toThrow(/especifique|mais de um/i)
    await expect(resolverPessoa('Ana Inativa')).rejects.toThrow(/não encontrei/i)
  })
  it('nome único resolve', async () => {
    const p = await resolverPessoa('Ana Silva')
    expect(p.name).toBe('Ana Silva')
  })
})
