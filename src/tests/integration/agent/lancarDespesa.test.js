import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser } from '../../helpers/factories.js'
import { buildRegistry } from '../../../lib/agent/tools/registry.js'
import tool from '../../../lib/agent/tools/write/proporLancarDespesa.js'
import { sanitizarParamsAudit } from '../../../lib/agent/audit.js'

describe('propor_lancar_despesa', () => {
  let emp, intern
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee', name: 'Ana' })
    intern = await makeUser({ role: 'administrative_intern', name: 'Estag' })
  })

  it('intern nem está no registry', () => {
    expect(buildRegistry(intern).get('propor_lancar_despesa')).toBeUndefined()
  })
  it('propose não grava', async () => {
    const p = await tool.propose(emp, { titulo: 'Uber', valor: 48.9, data: '2026-08-14' })
    expect(p.kind).toBe('lancar_despesa')
    expect(p.payload.amount).toBe(48.9)
    expect(p.payload).not.toHaveProperty('comprovanteBuffer')
    const { rows } = await query('SELECT COUNT(*)::int AS n FROM expense_requests WHERE user_id = $1', [emp.id])
    expect(rows[0].n).toBe(0)
  })
  it('valor ≤ 0 usa a mensagem da rota', async () => {
    await expect(tool.propose(emp, { titulo: 'x', valor: 0, data: '2026-08-14' }))
      .rejects.toThrow('Valor da despesa deve ser maior que zero.')
  })
  it('usar_comprovante sem arquivo → recusa', async () => {
    await expect(tool.propose(emp, { titulo: 'x', valor: 10, data: '2026-08-14', usar_comprovante: true }, {}))
      .rejects.toThrow(/anexe o pdf/i)
  })
  it('arquivo que não é PDF → recusa', async () => {
    await expect(tool.propose(emp, { titulo: 'x', valor: 10, data: '2026-08-14', usar_comprovante: true }, {
      anexoBruto: { buffer: Buffer.from('x'), mimetype: 'image/jpeg', filename: 'a.jpg' },
    })).rejects.toThrow(/pdf/i)
  })
  it('execute insere pending do profile; com PDF o receipt_url não é null', async () => {
    const { payload, comprovanteBuffer, comprovanteMime } = await tool.propose(
      emp,
      { titulo: 'Uber', valor: 10, data: '2026-08-14', usar_comprovante: true },
      { anexoBruto: { buffer: Buffer.from('%PDF-1.4'), mimetype: 'application/pdf', filename: 'r.pdf' } },
    )
    const { after } = await tool.execute(emp, payload, { comprovanteBuffer, comprovanteMime })
    expect(after.status).toBe('pending')
    expect(after.user_id).toBe(emp.id)
    expect(after.receipt_url).toBeTruthy()
    const auditado = sanitizarParamsAudit(payload, { comprovanteBuffer, comprovanteNome: 'r.pdf' })
    expect(auditado.comprovante).toBe(true)
    expect(JSON.stringify(auditado)).not.toMatch(/PDF-1/)
  })
})
