// Marcação de campo restrito com dado REAL em produção: cada asserção destas é
// um jeito de deixar PII vazando ou de perder marcação na virada.
//
// O teste do backfill (053) lê SÓ o arquivo da 053 e roda SEM catch — se o
// backfill não rodar (ou rodar contra a tabela errada), o teste falha alto.
// Espelha src/tests/integration/personBackfill.test.js (bloco B).
import { describe, it, expect, beforeEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resetDb, query } from '../helpers/db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ARQUIVO_BACKFILL = path.resolve(__dirname, '../../migrations/053_backfill_restritos.sql')

describe('052 — marcação de campo restrito', () => {
  let cliente
  beforeEach(async () => {
    await resetDb()
    const { rows } = await query(`INSERT INTO clients (name) VALUES ('Fulano') RETURNING id`)
    cliente = rows[0].id
  })

  it('marca um campo como restrito', async () => {
    await query(`INSERT INTO person_restricted_fields (client_id, field_name) VALUES ($1,'cpf')`, [cliente])
    const { rows } = await query(
      `SELECT field_name FROM person_restricted_fields WHERE client_id = $1`, [cliente])
    expect(rows.map((r) => r.field_name)).toEqual(['cpf'])
  })

  it('não marca o mesmo campo duas vezes', async () => {
    await query(`INSERT INTO person_restricted_fields (client_id, field_name) VALUES ($1,'cpf')`, [cliente])
    await expect(
      query(`INSERT INTO person_restricted_fields (client_id, field_name) VALUES ($1,'cpf')`, [cliente]),
    ).rejects.toThrow(/duplicate key/)
  })

  it('recusa linha com dois donos', async () => {
    const { rows } = await query(`INSERT INTO suppliers (name) VALUES ('Forn') RETURNING id`)
    await expect(
      query(`INSERT INTO person_restricted_fields (client_id, supplier_id, field_name) VALUES ($1,$2,'cpf')`,
        [cliente, rows[0].id]),
    ).rejects.toThrow(/prf_um_dono/)
  })

  it('recusa linha órfã', async () => {
    await expect(
      query(`INSERT INTO person_restricted_fields (field_name) VALUES ('cpf')`),
    ).rejects.toThrow(/prf_um_dono/)
  })

  it('apagar o cliente leva as marcações', async () => {
    await query(`INSERT INTO person_restricted_fields (client_id, field_name) VALUES ($1,'cpf')`, [cliente])
    await query(`DELETE FROM clients WHERE id = $1`, [cliente])
    const { rows } = await query(`SELECT count(*)::int AS c FROM person_restricted_fields`)
    expect(rows[0].c).toBe(0)
  })

  it('contatos e anexos têm is_restricted, default false', async () => {
    const { rows: t } = await query(
      `INSERT INTO person_phones (client_id, label, value) VALUES ($1,'celular','1') RETURNING is_restricted`,
      [cliente])
    expect(t[0].is_restricted).toBe(false)

    const { rows: a } = await query(
      `INSERT INTO client_attachments (client_id, file_url, file_name)
       VALUES ($1,'http://x/y.pdf','contrato.pdf') RETURNING is_restricted`, [cliente])
    expect(a[0].is_restricted).toBe(false)
  })

  // "Nascem restritos por padrão" com dado LEGADO tem que valer também: o
  // contrário deixaria justamente os cadastros reais desprotegidos.
  //
  // SEM .catch(): a 052 (DDL) já foi aplicada pelo globalSetup, então rodar só
  // a 053 aqui tem que executar de verdade — se ela falhar (ex.: apontar pra
  // tabela errada, ou o backfill não rodar), o teste precisa quebrar alto, não
  // engolir o erro e passar sem provar nada.
  it('o backfill marca os cadastros que já existiam', async () => {
    const sql = await readFile(ARQUIVO_BACKFILL, 'utf8')
    await query(sql)
    const { rows } = await query(
      `SELECT field_name FROM person_restricted_fields WHERE client_id = $1 ORDER BY field_name`, [cliente])
    expect(rows.map((r) => r.field_name)).toEqual(expect.arrayContaining(['cpf', 'cnpj', 'rg', 'pix_key']))
  })
})
