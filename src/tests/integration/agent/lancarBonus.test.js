import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser } from '../../helpers/factories.js'
import { buildRegistry } from '../../../lib/agent/tools/registry.js'
import lancar from '../../../lib/agent/tools/write/proporLancarBonus.js'
import editar from '../../../lib/agent/tools/write/proporEditarBonus.js'
import apagar from '../../../lib/agent/tools/write/proporApagarBonus.js'

describe('writes de bônus', () => {
  let admin, intern, emp
  beforeEach(async () => {
    await resetDb()
    admin = await makeUser({ role: 'admin', name: 'Ada' })
    intern = await makeUser({ role: 'administrative_intern', name: 'I1' })
    emp = await makeUser({ role: 'employee', name: 'Ana' })
  })
  it('intern e employee fora do registry', () => {
    expect(buildRegistry(intern).get('propor_lancar_bonus')).toBeUndefined()
    expect(buildRegistry(emp).get('propor_lancar_bonus')).toBeUndefined()
  })
  it('propose não grava; valor ≤ 0 e título vazio usam as mensagens da rota', async () => {
    const p = await lancar.propose(admin, { pessoa: 'Ana', titulo: 'Extra', valor: 800, data: '2026-08-01' })
    expect(p.kind).toBe('lancar_bonus')
    const { rows } = await query('SELECT COUNT(*)::int AS n FROM bonuses')
    expect(rows[0].n).toBe(0)
    await expect(lancar.propose(admin, { pessoa: 'Ana', titulo: 'x', valor: 0, data: '2026-08-01' }))
      .rejects.toThrow('Valor do bônus deve ser maior que zero.')
    await expect(lancar.propose(admin, { pessoa: 'Ana', titulo: '  ', valor: 10, data: '2026-08-01' }))
      .rejects.toThrow('Título é obrigatório.')
  })
  it('execute insere created_by = profile.id; editar id inexistente; delete some', async () => {
    const { payload } = await lancar.propose(admin, { pessoa: 'Ana', titulo: 'Extra', valor: 800, data: '2026-08-01' })
    const { after } = await lancar.execute(admin, payload)
    expect(after.created_by).toBe(admin.id)
    await expect(editar.propose(admin, { id: '11111111-1111-4111-8111-111111111111', titulo: 'Y' }))
      .rejects.toThrow('Bônus não encontrado.')
    const { payload: del } = await apagar.propose(admin, { id: after.id })
    await apagar.execute(admin, del)
    const { rows } = await query('SELECT COUNT(*)::int AS n FROM bonuses WHERE id = $1', [after.id])
    expect(rows[0].n).toBe(0)
  })
})
