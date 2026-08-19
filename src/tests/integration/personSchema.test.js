// Os CHECKs desta migration são a razão de ela existir: sem eles, "PJ" vira um
// rótulo que não garante nada, e um dia aparece uma pessoa jurídica sem razão
// social no meio de um contrato.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'

describe('040 — pessoa física e jurídica', () => {
  beforeEach(async () => { await resetDb() })

  it('cliente nasce como pessoa física', async () => {
    const { rows } = await query(
      `INSERT INTO clients (name) VALUES ('Fulano') RETURNING person_type`,
    )
    expect(rows[0].person_type).toBe('pf')
  })

  it('fornecedor nasce como pessoa física', async () => {
    const { rows } = await query(
      `INSERT INTO suppliers (name) VALUES ('Marcenaria') RETURNING person_type`,
    )
    expect(rows[0].person_type).toBe('pf')
  })

  it('aceita PJ com razão social', async () => {
    const { rows } = await query(
      `INSERT INTO clients (name, person_type, razao_social, cnpj)
       VALUES ('Construtora X', 'pj', 'Construtora X Ltda', '11.111.111/0001-11')
       RETURNING person_type, razao_social`,
    )
    expect(rows[0].person_type).toBe('pj')
    expect(rows[0].razao_social).toBe('Construtora X Ltda')
  })

  it('recusa PJ sem razão social', async () => {
    await expect(
      query(`INSERT INTO clients (name, person_type) VALUES ('Construtora X', 'pj')`),
    ).rejects.toThrow(/clients_pj_precisa_razao_social/)
  })

  it('recusa fornecedor PJ sem razão social', async () => {
    await expect(
      query(`INSERT INTO suppliers (name, person_type) VALUES ('Marcenaria', 'pj')`),
    ).rejects.toThrow(/suppliers_pj_precisa_razao_social/)
  })

  it('recusa person_type fora do enum', async () => {
    await expect(
      query(`INSERT INTO clients (name, person_type) VALUES ('X', 'mei')`),
    ).rejects.toThrow(/invalid input value for enum/)
  })

  it('guarda dados bancários em cliente e fornecedor', async () => {
    const { rows: c } = await query(
      `INSERT INTO clients (name, bank_name, bank_agency, bank_account, bank_account_type, pix_key)
       VALUES ('Fulano', 'Itaú', '1234', '56789-0', 'corrente', 'fulano@x.com')
       RETURNING bank_name, pix_key`,
    )
    expect(c[0].bank_name).toBe('Itaú')
    expect(c[0].pix_key).toBe('fulano@x.com')

    const { rows: s } = await query(
      `INSERT INTO suppliers (name, bank_name, pix_key)
       VALUES ('Marcenaria', 'Bradesco', '11.111.111/0001-11')
       RETURNING bank_name, pix_key`,
    )
    expect(s[0].bank_name).toBe('Bradesco')
  })

  it('cliente PF guarda RG', async () => {
    const { rows } = await query(
      `INSERT INTO clients (name, rg) VALUES ('Fulano', '12.345.678-9') RETURNING rg`,
    )
    expect(rows[0].rg).toBe('12.345.678-9')
  })
})
