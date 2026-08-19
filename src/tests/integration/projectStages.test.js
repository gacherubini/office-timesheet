import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { makeProject, makeUser } from '../helpers/factories.js'

describe('048 — etapas do projeto', () => {
  let projeto, resp
  beforeEach(async () => {
    await resetDb()
    projeto = await makeProject({ name: 'Grand Terroir 31' })
    resp = await makeUser({ role: 'employee', name: 'Ana' })
  })

  it('guarda nome, ordem, prazo, responsável e status', async () => {
    const { rows } = await query(
      `INSERT INTO project_stages (project_id, name, position, due_date, owner_id, status)
       VALUES ($1,'Anteprojeto',50,'2026-08-24',$2,'em_andamento')
       RETURNING name, position, due_date, owner_id, status`,
      [projeto.id, resp.id])
    expect(rows[0].name).toBe('Anteprojeto')
    expect(rows[0].position).toBe(50)
    expect(rows[0].status).toBe('em_andamento')
    expect(rows[0].owner_id).toBe(resp.id)
  })

  it('nasce como não iniciada', async () => {
    const { rows } = await query(
      `INSERT INTO project_stages (project_id, name) VALUES ($1,'Conceituação') RETURNING status`,
      [projeto.id])
    expect(rows[0].status).toBe('nao_iniciada')
  })

  it('aceita os quatro status do PDF', async () => {
    for (const s of ['nao_iniciada', 'em_andamento', 'entregue', 'aprovada']) {
      const { rows } = await query(
        `INSERT INTO project_stages (project_id, name, status) VALUES ($1,$2,$3) RETURNING status`,
        [projeto.id, `Etapa ${s}`, s])
      expect(rows[0].status).toBe(s)
    }
  })

  it('recusa status fora do enum', async () => {
    await expect(
      query(`INSERT INTO project_stages (project_id, name, status) VALUES ($1,'X','quase')`, [projeto.id]),
    ).rejects.toThrow(/invalid input value for enum/)
  })

  it('recusa duas etapas com o mesmo nome no mesmo projeto', async () => {
    await query(`INSERT INTO project_stages (project_id, name) VALUES ($1,'Anteprojeto')`, [projeto.id])
    await expect(
      query(`INSERT INTO project_stages (project_id, name) VALUES ($1,'Anteprojeto')`, [projeto.id]),
    ).rejects.toThrow(/duplicate key/)
  })

  it('projetos diferentes podem ter etapas de mesmo nome', async () => {
    const outro = await makeProject({ name: 'Casa 2' })
    await query(`INSERT INTO project_stages (project_id, name) VALUES ($1,'Anteprojeto')`, [projeto.id])
    await query(`INSERT INTO project_stages (project_id, name) VALUES ($1,'Anteprojeto')`, [outro.id])
    const { rows } = await query(`SELECT count(*)::int AS c FROM project_stages`)
    expect(rows[0].c).toBe(2)
  })

  // O nome é CÓPIA, não referência: renomear no catálogo não pode reescrever a
  // história de obras já entregues.
  it('renomear no catálogo NÃO renomeia a etapa da obra', async () => {
    const { rows: cat } = await query(
      `INSERT INTO stage_catalog (name, position) VALUES ('Etapa Teste', 500) RETURNING id`)
    await query(
      `INSERT INTO project_stages (project_id, catalog_id, name) VALUES ($1,$2,'Etapa Teste')`,
      [projeto.id, cat[0].id])
    await query(`UPDATE stage_catalog SET name = 'Etapa Renomeada' WHERE id = $1`, [cat[0].id])
    const { rows } = await query(`SELECT name FROM project_stages WHERE project_id = $1`, [projeto.id])
    expect(rows[0].name).toBe('Etapa Teste')
  })

  it('apagar a etapa do catálogo deixa a do projeto viva, sem procedência', async () => {
    const { rows: cat } = await query(
      `INSERT INTO stage_catalog (name, position) VALUES ('Etapa Teste', 500) RETURNING id`)
    await query(
      `INSERT INTO project_stages (project_id, catalog_id, name) VALUES ($1,$2,'Etapa Teste')`,
      [projeto.id, cat[0].id])
    await query(`DELETE FROM stage_catalog WHERE id = $1`, [cat[0].id])
    const { rows } = await query(`SELECT name, catalog_id FROM project_stages WHERE project_id = $1`, [projeto.id])
    expect(rows[0].name).toBe('Etapa Teste')
    expect(rows[0].catalog_id).toBeNull()
  })

  it('apagar o projeto leva as etapas', async () => {
    await query(`INSERT INTO project_stages (project_id, name) VALUES ($1,'Anteprojeto')`, [projeto.id])
    await query(`DELETE FROM projects WHERE id = $1`, [projeto.id])
    const { rows } = await query(`SELECT count(*)::int AS c FROM project_stages`)
    expect(rows[0].c).toBe(0)
  })
})
