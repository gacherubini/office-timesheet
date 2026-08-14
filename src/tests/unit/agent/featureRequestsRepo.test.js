import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../../helpers/db.js'
import { makeUser } from '../../helpers/factories.js'
import { insert, listar, atualizarStatus } from '../../../lib/agent/featureRequestsRepo.js'

describe('featureRequestsRepo', () => {
  let user
  beforeEach(async () => { await resetDb(); user = await makeUser({ role: 'employee' }) })

  it('grava e lista um pedido com o nome do usuário', async () => {
    await insert({ userId: user.id, role: user.role, descricao: 'exportar para Excel', textoOriginal: 'dá pra baixar em excel?' })
    const rows = await listar()
    expect(rows).toHaveLength(1)
    expect(rows[0].descricao).toBe('exportar para Excel')
    expect(rows[0].texto_original).toBe('dá pra baixar em excel?')
    expect(rows[0].status).toBe('novo')
    expect(rows[0].user_name).toBe(user.name)
  })

  it('atualiza o status', async () => {
    const { id } = await insert({ userId: user.id, role: user.role, descricao: 'x' })
    const upd = await atualizarStatus(id, 'feito')
    expect(upd.status).toBe('feito')
  })

  it('id inexistente devolve null', async () => {
    const r = await atualizarStatus('00000000-0000-0000-0000-000000000000', 'feito')
    expect(r).toBeNull()
  })
})
