import { describe, it, expect, beforeEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeProject } from '../helpers/factories.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BACKFILL = path.resolve(__dirname, '../../migrations/055_backfill_etapas_projetos_vazios.sql')

// O buraco que esta migration fecha:
//
// A 049 só criou etapa para projeto que TINHA tarefa (ela deriva a etapa do
// task_type de cada tarefa). A 048 é só DDL. E o catálogo inteiro só é
// semeado em POST /projects — ou seja, em projeto NOVO.
//
// Sobra o projeto que já existia e estava vazio: fica com zero etapas. E como
// "toda tarefa pertence a uma etapa" (item 8 do PDF) virou NOT NULL na 051 e
// validação na rota, criar tarefa nele passa a ser IMPOSSÍVEL. Pior para o
// arquiteto comum: criar tarefa é requireAuth, criar etapa é
// requireProjectManagement — ele trava e nem vê o botão que resolveria.
async function rodar() {
  await query(await readFile(BACKFILL, 'utf8'))
}

describe('055 — projeto legado sem etapa ganha o catálogo', () => {
  let vazio
  beforeEach(async () => {
    await resetDb()
    // `stage_catalog` está na lista de TRUNCATE do resetDb (é global e o
    // CASCADE não a alcança), então cada teste semeia o seu — mesmo padrão de
    // projectDefaultStages.test.js.
    await query(
      `INSERT INTO stage_catalog (name, position) VALUES
         ('Conceituação', 10), ('Anteprojeto', 50), ('Executivo', 90)`)
    vazio = await makeProject({ name: 'Obra parada' })
  })

  it('projeto sem nenhuma etapa recebe o catálogo ativo, na ordem dele', async () => {
    await rodar()
    const { rows } = await query(
      `SELECT s.name, s.position, s.catalog_id IS NOT NULL AS tem_procedencia
         FROM project_stages s WHERE s.project_id = $1 ORDER BY s.position, s.name`, [vazio.id])
    const { rows: catalogo } = await query(
      `SELECT name FROM stage_catalog WHERE NOT is_archived ORDER BY position, name`)

    expect(rows.length).toBe(catalogo.length)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.map((r) => r.name)).toEqual(catalogo.map((c) => c.name))
    expect(rows.every((r) => r.tem_procedencia)).toBe(true)
  })

  it('não toca em projeto que JÁ tem etapa — inclusive não acrescenta as que faltam', async () => {
    const comEtapa = await makeProject({ name: 'Obra em andamento' })
    await query(
      `INSERT INTO project_stages (project_id, name, position) VALUES ($1,'Só esta',10)`, [comEtapa.id])

    await rodar()

    const { rows } = await query(
      `SELECT name FROM project_stages WHERE project_id = $1`, [comEtapa.id])
    expect(rows.map((r) => r.name)).toEqual(['Só esta'])
  })

  it('etapa arquivada do catálogo não entra', async () => {
    await query(`INSERT INTO stage_catalog (name, position, is_archived) VALUES ('Etapa aposentada', 5, true)
                 ON CONFLICT (name) DO UPDATE SET is_archived = true`)
    await rodar()
    const { rows } = await query(
      `SELECT 1 FROM project_stages WHERE project_id = $1 AND name = 'Etapa aposentada'`, [vazio.id])
    expect(rows.length).toBe(0)
  })

  it('rodar duas vezes não duplica (o deploy sempre roda de novo)', async () => {
    await rodar()
    await rodar()
    const { rows } = await query(
      `SELECT name, COUNT(*)::int AS n FROM project_stages
        WHERE project_id = $1 GROUP BY name HAVING COUNT(*) > 1`, [vazio.id])
    expect(rows).toEqual([])
  })

  it('depois do backfill, o arquiteto comum consegue criar tarefa no projeto legado', async () => {
    await rodar()
    const emp = await makeUser({ role: 'employee', name: 'Arquiteta' })
    const { rows: etapas } = await query(
      `SELECT id FROM project_stages WHERE project_id = $1 ORDER BY position LIMIT 1`, [vazio.id])

    const res = await asUser(emp).post(`/projects/${vazio.id}/tasks`).send({
      title: 'Retomar a obra', stage_id: etapas[0].id,
    })
    expect(res.status).toBe(201)
  })
})
