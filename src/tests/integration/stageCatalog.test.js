import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resetDb, query } from '../helpers/db.js'
import { makeProject } from '../helpers/factories.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ARQUIVO = path.resolve(__dirname, '../../migrations/047_stage_catalog.sql')

async function rodarMigration() {
  await query(await readFile(ARQUIVO, 'utf8'))
}

const DEZ_DO_PDF = [
  'Conceituação', 'Estudo de viabilidade', 'Estudo de massa', 'Estudo preliminar',
  'Anteprojeto', 'Projeto legal', 'Projeto arquitetônico', 'Complementares',
  'Executivo', 'Acompanhamento de obra',
]

// Os testes que herdam task_type de "produção" reexecutam a 047 contra o
// recorte de schema que ela esperava (task_type ainda existe). A 051 já
// rodou de verdade no banco de teste e dropou a coluna — recriamos esse
// recorte só para ESTE describe (afterEach desfaz).
async function comTaskTypeLegado() {
  await query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type text`)
  await query(`ALTER TABLE tasks ALTER COLUMN stage_id DROP NOT NULL`)
}
async function semTaskTypeLegado() {
  await query(`DELETE FROM tasks`)
  await query(`ALTER TABLE tasks ALTER COLUMN stage_id SET NOT NULL`)
  await query(`ALTER TABLE tasks DROP COLUMN IF EXISTS task_type`)
}

describe('047 — catálogo de etapas', () => {
  beforeEach(async () => {
    await resetDb()
    await comTaskTypeLegado()
  })
  afterEach(semTaskTypeLegado)

  it('semeia as dez etapas do PDF, na ordem', async () => {
    await rodarMigration()
    const { rows } = await query(
      `SELECT name FROM stage_catalog WHERE position < 900 ORDER BY position`)
    expect(rows.map((r) => r.name)).toEqual(DEZ_DO_PDF)
  })

  // O caso que a lista do PDF sozinha perderia.
  it('herda os task_type de produção que não existem no catálogo', async () => {
    const p = await makeProject({ name: 'Obra' })
    await query(
      `INSERT INTO tasks (project_id, title, task_type) VALUES
        ($1, 'a', 'Compatibilização'), ($1, 'b', 'Detalhamento'), ($1, 'c', 'Reuniões')`, [p.id])
    await rodarMigration()
    const { rows } = await query(
      `SELECT name, position FROM stage_catalog WHERE position = 900 ORDER BY name`)
    expect(rows.map((r) => r.name)).toEqual(['Compatibilização', 'Detalhamento', 'Reuniões'])
  })

  it('task_type que JÁ está no catálogo não vira duplicata', async () => {
    const p = await makeProject({ name: 'Obra' })
    await query(`INSERT INTO tasks (project_id, title, task_type) VALUES ($1,'a','Anteprojeto')`, [p.id])
    await rodarMigration()
    const { rows } = await query(`SELECT count(*)::int AS c FROM stage_catalog WHERE name = 'Anteprojeto'`)
    expect(rows[0].c).toBe(1)
  })

  it('task_type nulo ou em branco não vira etapa', async () => {
    const p = await makeProject({ name: 'Obra' })
    await query(`INSERT INTO tasks (project_id, title, task_type) VALUES ($1,'a',NULL), ($1,'b','   ')`, [p.id])
    await rodarMigration()
    const { rows } = await query(`SELECT count(*)::int AS c FROM stage_catalog WHERE position = 900`)
    expect(rows[0].c).toBe(0)
  })

  it('nome é único', async () => {
    await rodarMigration()
    await expect(
      query(`INSERT INTO stage_catalog (name) VALUES ('Anteprojeto')`),
    ).rejects.toThrow(/duplicate key/)
  })

  it('é idempotente', async () => {
    await rodarMigration()
    await rodarMigration()
    const { rows } = await query(`SELECT count(*)::int AS c FROM stage_catalog`)
    expect(rows[0].c).toBe(10)
  })

  it('etapa arquivada continua existindo', async () => {
    await rodarMigration()
    await query(`UPDATE stage_catalog SET is_archived = true WHERE name = 'Complementares'`)
    const { rows } = await query(`SELECT is_archived FROM stage_catalog WHERE name = 'Complementares'`)
    expect(rows[0].is_archived).toBe(true)
  })
})
