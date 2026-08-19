// O índice parcial de "principal" é o coração destas tabelas. O PDF pede "um
// marcado como principal (o que aparece nas listagens)" — deixar isso só na UI
// garante que um dia existam dois principais e a listagem escolha por sorte.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'

async function novoCliente(nome = 'Fulano') {
  const { rows } = await query(`INSERT INTO clients (name) VALUES ($1) RETURNING id`, [nome])
  return rows[0].id
}
async function novoFornecedor(nome = 'Marcenaria') {
  const { rows } = await query(`INSERT INTO suppliers (name) VALUES ($1) RETURNING id`, [nome])
  return rows[0].id
}

describe('041 — contatos múltiplos', () => {
  let cliente
  beforeEach(async () => {
    await resetDb()
    cliente = await novoCliente()
  })

  it('guarda dois telefones com rótulos diferentes', async () => {
    await query(
      `INSERT INTO person_phones (client_id, label, value, is_primary, position)
       VALUES ($1, 'celular', '11999990000', true, 0),
              ($1, 'comercial', '1133330000', false, 1)`,
      [cliente],
    )
    const { rows } = await query(
      `SELECT label, value, is_primary FROM person_phones WHERE client_id = $1 ORDER BY position`,
      [cliente],
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].label).toBe('celular')
    expect(rows[0].is_primary).toBe(true)
    expect(rows[1].label).toBe('comercial')
    expect(rows[1].is_primary).toBe(false)
  })

  it('aceita rótulo personalizado', async () => {
    await query(
      `INSERT INTO person_phones (client_id, label, value) VALUES ($1, 'telefone da portaria', '1122223333')`,
      [cliente],
    )
    const { rows } = await query(`SELECT label FROM person_phones WHERE client_id = $1`, [cliente])
    expect(rows[0].label).toBe('telefone da portaria')
  })

  it('recusa dois principais do mesmo tipo no mesmo cliente', async () => {
    await query(
      `INSERT INTO person_phones (client_id, label, value, is_primary) VALUES ($1, 'celular', '1', true)`,
      [cliente],
    )
    await expect(
      query(`INSERT INTO person_phones (client_id, label, value, is_primary) VALUES ($1, 'comercial', '2', true)`,
        [cliente]),
    ).rejects.toThrow(/person_phones_principal_cliente/)
  })

  it('dois clientes podem ter cada um o seu principal', async () => {
    const outro = await novoCliente('Sicrano')
    await query(
      `INSERT INTO person_phones (client_id, label, value, is_primary) VALUES ($1, 'celular', '1', true)`,
      [cliente],
    )
    await query(
      `INSERT INTO person_phones (client_id, label, value, is_primary) VALUES ($1, 'celular', '2', true)`,
      [outro],
    )
    const { rows } = await query(`SELECT count(*)::int AS c FROM person_phones WHERE is_primary`)
    expect(rows[0].c).toBe(2)
  })

  it('recusa linha com cliente E fornecedor', async () => {
    const forn = await novoFornecedor()
    await expect(
      query(`INSERT INTO person_phones (client_id, supplier_id, label, value) VALUES ($1, $2, 'celular', '1')`,
        [cliente, forn]),
    ).rejects.toThrow(/person_phones_um_dono/)
  })

  it('recusa linha órfã (sem cliente nem fornecedor)', async () => {
    await expect(
      query(`INSERT INTO person_phones (label, value) VALUES ('celular', '1')`),
    ).rejects.toThrow(/person_phones_um_dono/)
  })

  it('apagar o cliente leva os contatos junto', async () => {
    await query(
      `INSERT INTO person_phones (client_id, label, value) VALUES ($1, 'celular', '1')`, [cliente])
    await query(`INSERT INTO person_emails (client_id, label, value) VALUES ($1, 'pessoal', 'a@b.c')`, [cliente])
    await query(`DELETE FROM clients WHERE id = $1`, [cliente])
    const { rows } = await query(
      `SELECT (SELECT count(*)::int FROM person_phones) AS tel,
              (SELECT count(*)::int FROM person_emails) AS mail`)
    expect(rows[0].tel).toBe(0)
    expect(rows[0].mail).toBe(0)
  })

  it('endereço guarda os campos separados que o CEP preenche', async () => {
    await query(
      `INSERT INTO person_addresses (client_id, label, cep, street, number, complement, district, city, uf, is_primary)
       VALUES ($1, 'obra', '01310-100', 'Av. Paulista', '1000', 'sala 5', 'Bela Vista', 'São Paulo', 'SP', true)`,
      [cliente],
    )
    const { rows } = await query(
      `SELECT cep, street, district, city, uf FROM person_addresses WHERE client_id = $1`, [cliente])
    expect(rows[0].cep).toBe('01310-100')
    expect(rows[0].street).toBe('Av. Paulista')
    expect(rows[0].city).toBe('São Paulo')
    expect(rows[0].uf).toBe('SP')
  })

  it('as três tabelas valem para fornecedor também', async () => {
    const forn = await novoFornecedor()
    await query(`INSERT INTO person_phones (supplier_id, label, value, is_primary) VALUES ($1, 'comercial', '1', true)`, [forn])
    await query(`INSERT INTO person_emails (supplier_id, label, value, is_primary) VALUES ($1, 'financeiro', 'nf@x.com', true)`, [forn])
    await query(`INSERT INTO person_addresses (supplier_id, label, city, is_primary) VALUES ($1, 'sede', 'Curitiba', true)`, [forn])
    const { rows } = await query(
      `SELECT (SELECT count(*)::int FROM person_phones    WHERE supplier_id = $1) AS tel,
              (SELECT count(*)::int FROM person_emails    WHERE supplier_id = $1) AS mail,
              (SELECT count(*)::int FROM person_addresses WHERE supplier_id = $1) AS end`,
      [forn])
    expect(rows[0].tel).toBe(1)
    expect(rows[0].mail).toBe(1)
    expect(rows[0].end).toBe(1)
  })

  it('recusa dois e-mails principais e dois endereços principais', async () => {
    await query(`INSERT INTO person_emails (client_id, label, value, is_primary) VALUES ($1, 'pessoal', 'a@b.c', true)`, [cliente])
    await expect(
      query(`INSERT INTO person_emails (client_id, label, value, is_primary) VALUES ($1, 'comercial', 'd@e.f', true)`, [cliente]),
    ).rejects.toThrow(/person_emails_principal_cliente/)

    await query(`INSERT INTO person_addresses (client_id, label, city, is_primary) VALUES ($1, 'sede', 'SP', true)`, [cliente])
    await expect(
      query(`INSERT INTO person_addresses (client_id, label, city, is_primary) VALUES ($1, 'obra', 'RJ', true)`, [cliente]),
    ).rejects.toThrow(/person_addresses_principal_cliente/)
  })
})
