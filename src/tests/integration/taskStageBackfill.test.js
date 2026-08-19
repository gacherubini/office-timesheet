import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resetDb, query } from '../helpers/db.js'
import { makeProject } from '../helpers/factories.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CATALOGO = path.resolve(__dirname, '../../migrations/047_stage_catalog.sql')
const BACKFILL = path.resolve(__dirname, '../../migrations/049_task_stage_id.sql')

// A 049 depende do catálogo estar semeado com os herdados — as duas rodam na
// ordem, como rodarão no deploy.
async function rodar() {
  await query(await readFile(CATALOGO, 'utf8'))
  await query(await readFile(BACKFILL, 'utf8'))
}

// Este describe reexecuta 047/049 (históricas) contra o recorte de schema que
// elas esperavam: task_type ainda existe e stage_id ainda é opcional. A 051
// já rodou de verdade no banco de teste (globalSetup aplica todas as
// migrações uma vez antes da suíte) — dropou task_type e tornou stage_id
// obrigatório. Recriamos esse recorte só para ESTE describe (afterEach
// desfaz), sem tocar no schema que o resto da suíte enxerga.
async function comTaskTypeLegado() {
  await query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type text`)
  await query(`ALTER TABLE tasks ALTER COLUMN stage_id DROP NOT NULL`)
}
async function semTaskTypeLegado() {
  await query(`DELETE FROM tasks`)
  await query(`ALTER TABLE tasks ALTER COLUMN stage_id SET NOT NULL`)
  await query(`ALTER TABLE tasks DROP COLUMN IF EXISTS task_type`)
}

describe('049 — tarefa passa a pertencer a uma etapa', () => {
  let projeto
  beforeEach(async () => {
    await resetDb()
    await comTaskTypeLegado()
    projeto = await makeProject({ name: 'Obra' })
  })
  afterEach(semTaskTypeLegado)

  it('task_type que existe no catálogo vira etapa com procedência', async () => {
    await query(`INSERT INTO tasks (project_id, title, task_type) VALUES ($1,'Planta','Anteprojeto')`, [projeto.id])
    await rodar()
    const { rows } = await query(
      `SELECT s.name, s.catalog_id IS NOT NULL AS tem_procedencia
         FROM tasks t JOIN project_stages s ON s.id = t.stage_id
        WHERE t.title = 'Planta'`)
    expect(rows[0].name).toBe('Anteprojeto')
    expect(rows[0].tem_procedencia).toBe(true)
  })

  // O caso que a lista do PDF sozinha perderia — ver Task 4.
  it('task_type herdado (Compatibilização) também acha etapa', async () => {
    await query(`INSERT INTO tasks (project_id, title, task_type) VALUES ($1,'Compat','Compatibilização')`, [projeto.id])
    await rodar()
    const { rows } = await query(
      `SELECT s.name FROM tasks t JOIN project_stages s ON s.id = t.stage_id WHERE t.title = 'Compat'`)
    expect(rows[0].name).toBe('Compatibilização')
  })

  it('tarefa SEM task_type cai em "Sem etapa"', async () => {
    await query(`INSERT INTO tasks (project_id, title) VALUES ($1,'Solta')`, [projeto.id])
    await rodar()
    const { rows } = await query(
      `SELECT s.name, s.position FROM tasks t JOIN project_stages s ON s.id = t.stage_id WHERE t.title = 'Solta'`)
    expect(rows[0].name).toBe('Sem etapa')
    expect(rows[0].position).toBe(999)
  })

  // A asserção que decide se o SET NOT NULL da 050 pode subir.
  it('NENHUMA tarefa fica com stage_id nulo', async () => {
    await query(
      `INSERT INTO tasks (project_id, title, task_type) VALUES
        ($1,'a','Anteprojeto'), ($1,'b','Compatibilização'), ($1,'c',NULL), ($1,'d','   ')`, [projeto.id])
    await rodar()
    const { rows } = await query(`SELECT count(*)::int AS c FROM tasks WHERE stage_id IS NULL`)
    expect(rows[0].c).toBe(0)
  })

  it('cada projeto ganha as SUAS etapas, não as do vizinho', async () => {
    const outro = await makeProject({ name: 'Obra 2' })
    await query(`INSERT INTO tasks (project_id, title, task_type) VALUES ($1,'a','Anteprojeto')`, [projeto.id])
    await query(`INSERT INTO tasks (project_id, title, task_type) VALUES ($1,'b','Executivo')`, [outro.id])
    await rodar()
    const { rows } = await query(
      `SELECT p.name AS projeto, s.name AS etapa FROM project_stages s
       JOIN projects p ON p.id = s.project_id ORDER BY p.name, s.name`)
    expect(rows).toEqual([
      { projeto: 'Obra', etapa: 'Anteprojeto' },
      { projeto: 'Obra 2', etapa: 'Executivo' },
    ])
  })

  it('duas tarefas do mesmo tipo compartilham a etapa', async () => {
    await query(
      `INSERT INTO tasks (project_id, title, task_type) VALUES ($1,'a','Anteprojeto'), ($1,'b','Anteprojeto')`,
      [projeto.id])
    await rodar()
    const { rows } = await query(`SELECT count(DISTINCT stage_id)::int AS c FROM tasks WHERE project_id = $1`, [projeto.id])
    expect(rows[0].c).toBe(1)
  })

  it('a etapa herda a ordem do catálogo', async () => {
    await query(
      `INSERT INTO tasks (project_id, title, task_type) VALUES ($1,'a','Executivo'), ($1,'b','Conceituação')`,
      [projeto.id])
    await rodar()
    const { rows } = await query(
      `SELECT name FROM project_stages WHERE project_id = $1 ORDER BY position`, [projeto.id])
    expect(rows.map((r) => r.name)).toEqual(['Conceituação', 'Executivo'])
  })

  it('é idempotente', async () => {
    await query(`INSERT INTO tasks (project_id, title, task_type) VALUES ($1,'a','Anteprojeto')`, [projeto.id])
    await rodar()
    await query(await readFile(BACKFILL, 'utf8'))
    const { rows } = await query(`SELECT count(*)::int AS c FROM project_stages WHERE project_id = $1`, [projeto.id])
    expect(rows[0].c).toBe(1)
  })

  it('projeto sem tarefa nenhuma não ganha "Sem etapa" à toa', async () => {
    await rodar()
    const { rows } = await query(`SELECT count(*)::int AS c FROM project_stages`)
    expect(rows[0].c).toBe(0)
  })
})
