import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeAdmin } from '../helpers/factories.js'

// Item 1 do brief de 19/08/2026: projeto sem template nascia SEM etapa
// nenhuma — a pessoa tinha que abrir "Gerenciar etapas" e marcar uma a uma.
// O escritório faz sempre o mesmo tipo de obra, então o default vira
// opt-out: o projeto nasce com TODAS as etapas não-arquivadas do catálogo,
// na ordem do catálogo, e quem monta o projeto REMOVE as que não se aplicam.
describe('projeto sem template nasce com o catálogo inteiro', () => {
  let admin, cliente
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    const { rows } = await query(`INSERT INTO clients (name) VALUES ('Cliente') RETURNING id`)
    cliente = rows[0].id
  })

  it('nasce com as N etapas ativas do catálogo, na ordem', async () => {
    await query(
      `INSERT INTO stage_catalog (name, position) VALUES
         ('Conceituação', 10), ('Anteprojeto', 50), ('Executivo', 90)`)

    const res = await asUser(admin).post('/projects').send({
      name: 'Casa Nova', client_id: cliente, start_date: '2026-08-01',
    })
    expect(res.status).toBe(201)

    const etapas = await asUser(admin).get(`/projects/${res.body.id}/stages`)
    expect(etapas.body.map((s) => s.name)).toEqual(['Conceituação', 'Anteprojeto', 'Executivo'])
    // Procedência guardada — mesma regra da etapa gerada por template.
    expect(etapas.body.every((s) => s.catalog_id)).toBe(true)
  })

  it('etapa arquivada no catálogo não entra', async () => {
    await query(
      `INSERT INTO stage_catalog (name, position, is_archived) VALUES
         ('Conceituação', 10, false), ('Reuniões', 900, true)`)

    const res = await asUser(admin).post('/projects').send({
      name: 'Casa Nova', client_id: cliente, start_date: '2026-08-01',
    })
    const etapas = await asUser(admin).get(`/projects/${res.body.id}/stages`)
    expect(etapas.body.map((s) => s.name)).toEqual(['Conceituação'])
  })

  it('catálogo vazio: projeto nasce sem etapa (não quebra)', async () => {
    const res = await asUser(admin).post('/projects').send({
      name: 'Casa Nova', client_id: cliente, start_date: '2026-08-01',
    })
    expect(res.status).toBe(201)
    const etapas = await asUser(admin).get(`/projects/${res.body.id}/stages`)
    expect(etapas.body).toHaveLength(0)
  })

  it('projeto COM template nasce só com as etapas do template, não soma o catálogo', async () => {
    await query(
      `INSERT INTO stage_catalog (name, position) VALUES
         ('Conceituação', 10), ('Anteprojeto', 50), ('Executivo', 90)`)
    const { rows: cat } = await query(`SELECT id, name FROM stage_catalog WHERE name = 'Anteprojeto'`)
    const { rows: t } = await query(`INSERT INTO project_templates (name) VALUES ('Residencial') RETURNING id`)
    await query(
      `INSERT INTO project_template_stages (template_id, catalog_id, name, position)
       VALUES ($1,$2,'Anteprojeto',0)`, [t[0].id, cat[0].id])

    const res = await asUser(admin).post('/projects').send({
      name: 'Casa Nova', client_id: cliente, template_id: t[0].id, start_date: '2026-08-01',
    })
    expect(res.status).toBe(201)
    const etapas = await asUser(admin).get(`/projects/${res.body.id}/stages`)
    // Só a etapa do template — "Conceituação" e "Executivo" do catálogo NÃO entram.
    expect(etapas.body.map((s) => s.name)).toEqual(['Anteprojeto'])
  })
})
