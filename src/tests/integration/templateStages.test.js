import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeAdmin } from '../helpers/factories.js'

describe('templates geram etapas e tarefas', () => {
  let admin, cliente
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    const { rows } = await query(`INSERT INTO clients (name) VALUES ('Cliente') RETURNING id`)
    cliente = rows[0].id
    await query(`INSERT INTO stage_catalog (name, position) VALUES ('Anteprojeto', 50), ('Executivo', 90)`)
  })

  async function templateComEtapas() {
    const { rows: t } = await query(
      `INSERT INTO project_templates (name) VALUES ('Residencial') RETURNING id`)
    const { rows: cat } = await query(`SELECT id, name FROM stage_catalog ORDER BY position`)
    const { rows: e1 } = await query(
      `INSERT INTO project_template_stages (template_id, catalog_id, name, position)
       VALUES ($1,$2,'Anteprojeto',0) RETURNING id`, [t[0].id, cat[0].id])
    const { rows: e2 } = await query(
      `INSERT INTO project_template_stages (template_id, catalog_id, name, position)
       VALUES ($1,$2,'Executivo',1) RETURNING id`, [t[0].id, cat[1].id])
    await query(
      `INSERT INTO project_template_items (template_id, template_stage_id, title, position)
       VALUES ($1,$2,'Planta pav. tipo',0), ($1,$2,'Cortes AA/BB',1), ($1,$3,'Detalhamento',0)`,
      [t[0].id, e1[0].id, e2[0].id])
    return t[0].id
  }

  it('cria o projeto com as etapas do template', async () => {
    const tpl = await templateComEtapas()
    const res = await asUser(admin).post('/projects').send({
      name: 'Casa Nova', client_id: cliente, template_id: tpl, start_date: '2026-08-01',
    })
    expect(res.status).toBe(201)
    const etapas = await asUser(admin).get(`/projects/${res.body.id}/stages`)
    expect(etapas.body.map((s) => s.name)).toEqual(['Anteprojeto', 'Executivo'])
  })

  it('as tarefas nascem na etapa certa', async () => {
    const tpl = await templateComEtapas()
    const res = await asUser(admin).post('/projects').send({
      name: 'Casa Nova', client_id: cliente, template_id: tpl, start_date: '2026-08-01',
    })
    const { rows } = await query(
      `SELECT t.title, s.name AS etapa FROM tasks t JOIN project_stages s ON s.id = t.stage_id
        WHERE t.project_id = $1 ORDER BY s.position, t.position`, [res.body.id])
    expect(rows).toEqual([
      { title: 'Planta pav. tipo', etapa: 'Anteprojeto' },
      { title: 'Cortes AA/BB', etapa: 'Anteprojeto' },
      { title: 'Detalhamento', etapa: 'Executivo' },
    ])
  })

  it('a etapa gerada guarda a procedência do catálogo', async () => {
    const tpl = await templateComEtapas()
    const res = await asUser(admin).post('/projects').send({
      name: 'Casa Nova', client_id: cliente, template_id: tpl, start_date: '2026-08-01',
    })
    const { rows } = await query(
      `SELECT count(*)::int AS c FROM project_stages WHERE project_id = $1 AND catalog_id IS NOT NULL`,
      [res.body.id])
    expect(rows[0].c).toBe(2)
  })

  // Compatibilidade para trás: templates criados antes deste bloco não têm
  // etapas, e as tarefas deles precisam ir para algum lugar.
  it('template ANTIGO (sem etapas) gera tarefas em "Sem etapa"', async () => {
    const { rows: t } = await query(
      `INSERT INTO project_templates (name) VALUES ('Antigo') RETURNING id`)
    await query(
      `INSERT INTO project_template_items (template_id, title, position) VALUES ($1,'Tarefa solta',0)`, [t[0].id])
    const res = await asUser(admin).post('/projects').send({
      name: 'Casa Velha', client_id: cliente, template_id: t[0].id, start_date: '2026-08-01',
    })
    expect(res.status).toBe(201)
    const { rows } = await query(
      `SELECT s.name FROM tasks t JOIN project_stages s ON s.id = t.stage_id WHERE t.project_id = $1`,
      [res.body.id])
    expect(rows[0].name).toBe('Sem etapa')
  })

  it('projeto sem template nasce sem etapa e sem tarefa', async () => {
    const res = await asUser(admin).post('/projects').send({
      name: 'Vazio', client_id: cliente, start_date: '2026-08-01',
    })
    const etapas = await asUser(admin).get(`/projects/${res.body.id}/stages`)
    expect(etapas.body).toHaveLength(0)
  })

  it('apagar o template leva as etapas dele', async () => {
    const tpl = await templateComEtapas()
    await query(`DELETE FROM project_templates WHERE id = $1`, [tpl])
    const { rows } = await query(`SELECT count(*)::int AS c FROM project_template_stages`)
    expect(rows[0].c).toBe(0)
  })

  // Bug: PUT /project-templates/:id sempre fazia DELETE + insertStages([]) das
  // etapas quando o corpo não trazia `stages` — a TemplateManager.jsx atual
  // não manda esse campo, então o primeiro save de um template que ganhou
  // etapas por API apagava todas elas. Mesmo padrão de "chave ausente
  // preserva" que routes/clients.js usa no PUT (restricted_fields só é
  // regravado quando a chave veio no corpo).
  it('PUT sem `stages` no corpo preserva as etapas existentes', async () => {
    const tpl = await templateComEtapas()
    const antes = await asUser(admin).get(`/project-templates/${tpl}`)
    expect(antes.body.stages.map((s) => s.name)).toEqual(['Anteprojeto', 'Executivo'])

    // Corpo como a tela ATUAL manda: name/description/items, sem `stages`.
    const res = await asUser(admin).put(`/project-templates/${tpl}`).send({
      name: 'Residencial (editado)',
      items: [{ title: 'Tarefa nova' }],
    })
    expect(res.status).toBe(200)

    const depois = await asUser(admin).get(`/project-templates/${tpl}`)
    expect(depois.body.stages.map((s) => s.name)).toEqual(['Anteprojeto', 'Executivo'])
  })

  it('PUT COM `stages` no corpo continua substituindo (comportamento normal)', async () => {
    const tpl = await templateComEtapas()
    const res = await asUser(admin).put(`/project-templates/${tpl}`).send({
      name: 'Residencial (editado)',
      stages: [{ name: 'Só uma etapa' }],
      items: [{ title: 'Tarefa', stage_index: 0 }],
    })
    expect(res.status).toBe(200)

    const depois = await asUser(admin).get(`/project-templates/${tpl}`)
    expect(depois.body.stages.map((s) => s.name)).toEqual(['Só uma etapa'])
  })
})
