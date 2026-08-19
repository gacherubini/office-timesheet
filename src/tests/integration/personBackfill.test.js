// Backfill com dado REAL em produção: cada linha destas asserções é um jeito de
// perder informação de cliente na virada. O SQL testado é lido do próprio
// arquivo de migration — não uma cópia que pode divergir dele.
import { describe, it, expect, beforeEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resetDb, query } from '../helpers/db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ARQUIVO = path.resolve(__dirname, '../../migrations/043_backfill_contatos.sql')

async function rodarBackfill() {
  const sql = await readFile(ARQUIVO, 'utf8')
  await query(sql)
}

describe('043 — backfill dos contatos antigos', () => {
  beforeEach(async () => { await resetDb() })

  it('telefone antigo vira telefone principal', async () => {
    const { rows } = await query(
      `INSERT INTO clients (name, phone) VALUES ('Fulano', '11999990000') RETURNING id`)
    await rodarBackfill()
    const { rows: tel } = await query(
      `SELECT label, value, is_primary FROM person_phones WHERE client_id = $1`, [rows[0].id])
    expect(tel).toHaveLength(1)
    expect(tel[0].value).toBe('11999990000')
    expect(tel[0].is_primary).toBe(true)
    expect(tel[0].label).toBe('principal')
  })

  it('e-mail antigo vira e-mail principal', async () => {
    const { rows } = await query(
      `INSERT INTO clients (name, email) VALUES ('Fulano', 'a@b.c') RETURNING id`)
    await rodarBackfill()
    const { rows: mail } = await query(
      `SELECT value, is_primary FROM person_emails WHERE client_id = $1`, [rows[0].id])
    expect(mail[0].value).toBe('a@b.c')
    expect(mail[0].is_primary).toBe(true)
  })

  // Endereço antigo é TEXTO LIVRE e o modelo novo é estruturado. O texto inteiro
  // vai para `street` e ninguém tenta adivinhar rua/número/cidade: parser de
  // endereço brasileiro erra, e errar aqui é pior que não estruturar.
  it('endereço antigo vai inteiro para street, sem adivinhação', async () => {
    const { rows } = await query(
      `INSERT INTO clients (name, address) VALUES ('Fulano', 'Rua das Flores, 123 - Centro, São Paulo/SP') RETURNING id`)
    await rodarBackfill()
    const { rows: end } = await query(
      `SELECT street, city, number, is_primary FROM person_addresses WHERE client_id = $1`, [rows[0].id])
    expect(end[0].street).toBe('Rua das Flores, 123 - Centro, São Paulo/SP')
    expect(end[0].city).toBeNull()
    expect(end[0].number).toBeNull()
    expect(end[0].is_primary).toBe(true)
  })

  it('cliente sem contato nenhum não gera linha', async () => {
    await query(`INSERT INTO clients (name) VALUES ('Vazio')`)
    await rodarBackfill()
    const { rows } = await query(
      `SELECT (SELECT count(*)::int FROM person_phones) AS t,
              (SELECT count(*)::int FROM person_emails) AS e,
              (SELECT count(*)::int FROM person_addresses) AS a`)
    expect(rows[0]).toEqual({ t: 0, e: 0, a: 0 })
  })

  it('string em branco não gera linha', async () => {
    await query(`INSERT INTO clients (name, phone, email, address) VALUES ('Branco', '   ', '', '  ')`)
    await rodarBackfill()
    const { rows } = await query(`SELECT count(*)::int AS c FROM person_phones`)
    expect(rows[0].c).toBe(0)
  })

  it('fornecedor também é migrado', async () => {
    const { rows } = await query(
      `INSERT INTO suppliers (name, phone, email) VALUES ('Marcenaria', '1133330000', 'nf@x.com') RETURNING id`)
    await rodarBackfill()
    const { rows: r } = await query(
      `SELECT (SELECT count(*)::int FROM person_phones WHERE supplier_id = $1) AS t,
              (SELECT count(*)::int FROM person_emails WHERE supplier_id = $1) AS e`, [rows[0].id])
    expect(r[0]).toEqual({ t: 1, e: 1 })
  })

  // Rodar de novo não pode duplicar: no dia do deploy alguém sempre roda duas
  // vezes por engano, e o índice de principal transformaria isso num erro feio.
  it('é idempotente', async () => {
    await query(`INSERT INTO clients (name, phone) VALUES ('Fulano', '11999990000')`)
    await rodarBackfill()
    await rodarBackfill()
    const { rows } = await query(`SELECT count(*)::int AS c FROM person_phones`)
    expect(rows[0].c).toBe(1)
  })

  it('as colunas antigas continuam preenchidas — a migration é reversível', async () => {
    const { rows } = await query(
      `INSERT INTO clients (name, phone, email, address)
       VALUES ('Fulano', '11999990000', 'a@b.c', 'Rua X') RETURNING id`)
    await rodarBackfill()
    const { rows: c } = await query(
      `SELECT phone, email, address FROM clients WHERE id = $1`, [rows[0].id])
    expect(c[0].phone).toBe('11999990000')
    expect(c[0].email).toBe('a@b.c')
    expect(c[0].address).toBe('Rua X')
  })
})
