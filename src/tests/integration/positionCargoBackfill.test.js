// Backfill do CARGO (users.position): quem já estava cadastrado tinha o
// rótulo da PERMISSÃO gravado ali (bug corrigido em roleLabel(role) →
// position). O pedido do cliente foi só "Colaborador" virar "Arquiteto" — os
// outros rótulos de permissão ('Administrador', 'Estagiário Administrativo',
// 'Gestor de Projetos') não são cargo de ninguém que a gente saiba, então
// ficam como estão. O SQL testado é lido do próprio arquivo de migration —
// não uma cópia que pode divergir dele.
import { describe, it, expect, beforeEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resetDb, query } from '../helpers/db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ARQUIVO = path.resolve(__dirname, '../../migrations/054_backfill_cargo_colaborador.sql')

async function rodarBackfill() {
  const sql = await readFile(ARQUIVO, 'utf8')
  await query(sql)
}

async function criarUsuario(nome, position) {
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, name, position)
     VALUES ($1, 'hash', $2, $3) RETURNING id`,
    [`${nome}@teste.com`, nome, position])
  return rows[0].id
}

describe('054 — backfill do cargo (position) de \'Colaborador\'', () => {
  beforeEach(async () => { await resetDb() })

  it('quem tinha "Colaborador" gravado no cargo vira "Arquiteto"', async () => {
    const id = await criarUsuario('Fulano', 'Colaborador')
    await rodarBackfill()
    const { rows } = await query(`SELECT position FROM users WHERE id = $1`, [id])
    expect(rows[0].position).toBe('Arquiteto')
  })

  // O ponto central da correção: não adivinhar o cargo real a partir da
  // permissão. Repetir esse erro aqui — só com outro valor — seria
  // reintroduzir o mesmo bug.
  it('NÃO toca em quem tem "Administrador" gravado no cargo', async () => {
    const id = await criarUsuario('Ciclana', 'Administrador')
    await rodarBackfill()
    const { rows } = await query(`SELECT position FROM users WHERE id = $1`, [id])
    expect(rows[0].position).toBe('Administrador')
  })

  it('NÃO toca em quem tem "Gestor de Projetos" gravado no cargo', async () => {
    const id = await criarUsuario('Beltrano', 'Gestor de Projetos')
    await rodarBackfill()
    const { rows } = await query(`SELECT position FROM users WHERE id = $1`, [id])
    expect(rows[0].position).toBe('Gestor de Projetos')
  })

  it('NÃO toca em quem tem "Estagiário Administrativo" gravado no cargo', async () => {
    const id = await criarUsuario('Estagiario', 'Estagiário Administrativo')
    await rodarBackfill()
    const { rows } = await query(`SELECT position FROM users WHERE id = $1`, [id])
    expect(rows[0].position).toBe('Estagiário Administrativo')
  })

  it('quem já tem cargo digitado corretamente (ex: "Arquiteto") não muda', async () => {
    const id = await criarUsuario('Arquiteta', 'Arquiteto')
    await rodarBackfill()
    const { rows } = await query(`SELECT position FROM users WHERE id = $1`, [id])
    expect(rows[0].position).toBe('Arquiteto')
  })

  it('é idempotente', async () => {
    const id = await criarUsuario('Fulano', 'Colaborador')
    await rodarBackfill()
    await rodarBackfill()
    const { rows } = await query(`SELECT position FROM users WHERE id = $1`, [id])
    expect(rows[0].position).toBe('Arquiteto')
  })
})
