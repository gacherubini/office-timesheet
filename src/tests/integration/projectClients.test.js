// "Um projeto pode ter mais de um contratante — casal, sócios, investidor mais
// construtora" (item 7 do PDF de 18/08/2026).
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { makeProject } from '../helpers/factories.js'

async function cliente(nome) {
  const { rows } = await query(`INSERT INTO clients (name) VALUES ($1) RETURNING id`, [nome])
  return rows[0].id
}

describe('045 — vários clientes por projeto', () => {
  let projeto, casal1, casal2
  beforeEach(async () => {
    await resetDb()
    projeto = (await makeProject({ name: 'Grand Terroir 31' })).id
    casal1 = await cliente('Luiz Eduardo')
    casal2 = await cliente('Marina')
  })

  it('guarda dois contratantes com papéis', async () => {
    await query(
      `INSERT INTO project_clients (project_id, client_id, role, is_primary)
       VALUES ($1, $2, 'contratante_principal', true), ($1, $3, 'contratante', false)`,
      [projeto, casal1, casal2],
    )
    const { rows } = await query(
      `SELECT c.name, pc.role, pc.is_primary FROM project_clients pc
       JOIN clients c ON c.id = pc.client_id WHERE pc.project_id = $1 ORDER BY pc.is_primary DESC`,
      [projeto],
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].name).toBe('Luiz Eduardo')
    expect(rows[0].is_primary).toBe(true)
  })

  it('recusa dois principais no mesmo projeto', async () => {
    await query(`INSERT INTO project_clients (project_id, client_id, is_primary) VALUES ($1,$2,true)`,
      [projeto, casal1])
    await expect(
      query(`INSERT INTO project_clients (project_id, client_id, is_primary) VALUES ($1,$2,true)`,
        [projeto, casal2]),
    ).rejects.toThrow(/project_clients_um_principal/)
  })

  it('projetos diferentes têm cada um o seu principal', async () => {
    const outro = (await makeProject({ name: 'Casa 2' })).id
    await query(`INSERT INTO project_clients (project_id, client_id, is_primary) VALUES ($1,$2,true)`, [projeto, casal1])
    await query(`INSERT INTO project_clients (project_id, client_id, is_primary) VALUES ($1,$2,true)`, [outro, casal1])
    const { rows } = await query(`SELECT count(*)::int AS c FROM project_clients WHERE is_primary`)
    expect(rows[0].c).toBe(2)
  })

  it('recusa o mesmo cliente duas vezes no mesmo projeto', async () => {
    await query(`INSERT INTO project_clients (project_id, client_id) VALUES ($1,$2)`, [projeto, casal1])
    await expect(
      query(`INSERT INTO project_clients (project_id, client_id) VALUES ($1,$2)`, [projeto, casal1]),
    ).rejects.toThrow(/duplicate key/)
  })

  it('recusa papel fora da lista', async () => {
    await expect(
      query(`INSERT INTO project_clients (project_id, client_id, role) VALUES ($1,$2,'padrinho')`,
        [projeto, casal1]),
    ).rejects.toThrow(/project_clients_papel_valido/)
  })

  // RESTRICT de propósito: apagar um cliente que é contratante de uma obra tem
  // que doer. CASCADE aqui apagaria o vínculo em silêncio.
  it('não deixa apagar cliente que é contratante', async () => {
    await query(`INSERT INTO project_clients (project_id, client_id) VALUES ($1,$2)`, [projeto, casal1])
    await expect(
      query(`DELETE FROM clients WHERE id = $1`, [casal1]),
    ).rejects.toThrow(/violates foreign key constraint/)
  })

  it('apagar o projeto leva os vínculos junto', async () => {
    await query(`INSERT INTO project_clients (project_id, client_id) VALUES ($1,$2)`, [projeto, casal1])
    await query(`DELETE FROM projects WHERE id = $1`, [projeto])
    const { rows } = await query(`SELECT count(*)::int AS c FROM project_clients`)
    expect(rows[0].c).toBe(0)
  })

  it('o contador da ficha da pessoa conta TODOS os papéis', async () => {
    const investidor = await cliente('Investidor')
    await query(
      `INSERT INTO project_clients (project_id, client_id, role, is_primary)
       VALUES ($1,$2,'contratante_principal',true), ($1,$3,'investidor',false)`,
      [projeto, casal1, investidor],
    )
    const { rows } = await query(
      `SELECT count(*)::int AS c FROM project_clients WHERE client_id = $1`, [investidor])
    expect(rows[0].c).toBe(1)
  })
})
