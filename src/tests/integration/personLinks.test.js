// "O vínculo é feito pelo cadastro existente, nunca por texto digitado — evita
// a mesma pessoa duplicada" (PDF, item 3). É por isso que o membro é FK e não
// text: o banco recusa um sócio que não existe.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'

async function pj(nome) {
  const { rows } = await query(
    `INSERT INTO clients (name, person_type, razao_social) VALUES ($1, 'pj', $1) RETURNING id`, [nome])
  return rows[0].id
}
async function pf(nome) {
  const { rows } = await query(`INSERT INTO clients (name) VALUES ($1) RETURNING id`, [nome])
  return rows[0].id
}

describe('042 — vínculo PJ ↔ PF', () => {
  let construtora, socio, financeiro
  beforeEach(async () => {
    await resetDb()
    construtora = await pj('Construtora X')
    socio = await pf('João Sócio')
    financeiro = await pf('Maria Financeiro')
  })

  it('uma PJ tem várias PF com papéis diferentes', async () => {
    await query(
      `INSERT INTO person_links (company_client_id, member_client_id, role)
       VALUES ($1, $2, 'socio'), ($1, $3, 'financeiro')`,
      [construtora, socio, financeiro],
    )
    const { rows } = await query(
      `SELECT c.name, l.role FROM person_links l
       JOIN clients c ON c.id = l.member_client_id
       WHERE l.company_client_id = $1 ORDER BY l.role`,
      [construtora],
    )
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.role)).toEqual(['financeiro', 'socio'])
    expect(rows.map((r) => r.name)).toContain('João Sócio')
  })

  it('recusa membro que não existe no cadastro', async () => {
    await expect(
      query(`INSERT INTO person_links (company_client_id, member_client_id, role)
             VALUES ($1, '00000000-0000-0000-0000-000000000000', 'socio')`, [construtora]),
    ).rejects.toThrow(/violates foreign key constraint/)
  })

  it('recusa papel fora da lista', async () => {
    await expect(
      query(`INSERT INTO person_links (company_client_id, member_client_id, role)
             VALUES ($1, $2, 'primo')`, [construtora, socio]),
    ).rejects.toThrow(/person_links_papel_valido/)
  })

  it('recusa vínculo entre lados diferentes (PJ cliente ↔ PF fornecedor)', async () => {
    const { rows } = await query(`INSERT INTO suppliers (name) VALUES ('Zé') RETURNING id`)
    await expect(
      query(`INSERT INTO person_links (company_client_id, member_supplier_id, role)
             VALUES ($1, $2, 'socio')`, [construtora, rows[0].id]),
    ).rejects.toThrow(/person_links_mesmo_lado/)
  })

  it('recusa vínculo sem empresa', async () => {
    await expect(
      query(`INSERT INTO person_links (member_client_id, role) VALUES ($1, 'socio')`, [socio]),
    ).rejects.toThrow(/person_links_uma_empresa/)
  })

  it('recusa duas empresas na mesma linha', async () => {
    const { rows } = await query(`INSERT INTO suppliers (name) VALUES ('Forn') RETURNING id`)
    await expect(
      query(`INSERT INTO person_links (company_client_id, company_supplier_id, member_client_id, role)
             VALUES ($1, $2, $3, 'socio')`, [construtora, rows[0].id, socio]),
    ).rejects.toThrow(/person_links_uma_empresa/)
  })

  it('recusa o mesmo par duas vezes', async () => {
    await query(`INSERT INTO person_links (company_client_id, member_client_id, role)
                 VALUES ($1, $2, 'socio')`, [construtora, socio])
    await expect(
      query(`INSERT INTO person_links (company_client_id, member_client_id, role)
             VALUES ($1, $2, 'contato_principal')`, [construtora, socio]),
    ).rejects.toThrow(/person_links_par_cliente/)
  })

  it('apagar a PJ leva os vínculos, não as PF', async () => {
    await query(`INSERT INTO person_links (company_client_id, member_client_id, role)
                 VALUES ($1, $2, 'socio')`, [construtora, socio])
    await query(`DELETE FROM clients WHERE id = $1`, [construtora])
    const { rows } = await query(
      `SELECT (SELECT count(*)::int FROM person_links) AS v,
              (SELECT count(*)::int FROM clients WHERE id = $1) AS pf`, [socio])
    expect(rows[0].v).toBe(0)
    expect(rows[0].pf).toBe(1)
  })

  it('vale para fornecedor PJ com fornecedor PF', async () => {
    const { rows: e } = await query(
      `INSERT INTO suppliers (name, person_type, razao_social) VALUES ('Marcenaria SA','pj','Marcenaria SA') RETURNING id`)
    const { rows: p } = await query(`INSERT INTO suppliers (name) VALUES ('Zé Marceneiro') RETURNING id`)
    await query(`INSERT INTO person_links (company_supplier_id, member_supplier_id, role)
                 VALUES ($1, $2, 'responsavel_tecnico')`, [e[0].id, p[0].id])
    const { rows } = await query(`SELECT count(*)::int AS c FROM person_links`)
    expect(rows[0].c).toBe(1)
  })
})
