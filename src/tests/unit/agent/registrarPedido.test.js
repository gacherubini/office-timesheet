import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/meta/registrarPedidoNaoAtendido.js'

describe('tool registrar_pedido_nao_atendido', () => {
  let user
  beforeEach(async () => { await resetDb(); user = await makeUser({ role: 'employee' }) })

  it('é kind meta, disponível a todos os papéis', () => {
    expect(tool.kind).toBe('meta')
    expect(tool.roles).toEqual(expect.arrayContaining(['admin', 'employee', 'administrative_intern', 'project_manager']))
  })

  it('grava o pedido e devolve aviso', async () => {
    const r = await tool.run(user, { descricao: 'exportar para Excel', texto_original: 'dá pra baixar em excel?' })
    expect(r.ok).toBe(true)
    expect(r.aviso).toMatch(/anotada|registr/i)
    const { rows } = await query('SELECT descricao, texto_original, user_id FROM agent_feature_requests')
    expect(rows[0].descricao).toBe('exportar para Excel')
    expect(rows[0].user_id).toBe(user.id)
  })

  it('descricao vazia é erro', async () => {
    await expect(tool.run(user, { descricao: '  ' })).rejects.toThrow()
  })
})
