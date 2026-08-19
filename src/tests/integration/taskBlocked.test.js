// "Tarefa parada esperando cliente, topografia ou prefeitura não é 'a fazer'
// nem 'fazendo', e é a maior fonte de atraso" (item 8 do PDF).
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeAdmin, makeProject } from '../helpers/factories.js'

describe('046 — status "Falta info"', () => {
  let admin, projeto, etapa
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    projeto = await makeProject({ name: 'Obra' })
    // Desde a 049, toda tarefa exige stage_id na criação (POST /projects/:id/tasks).
    const { rows } = await query(
      `INSERT INTO project_stages (project_id, name) VALUES ($1,'Anteprojeto') RETURNING id`,
      [projeto.id])
    etapa = rows[0].id
  })

  it('o enum aceita blocked', async () => {
    const { rows } = await query(
      `INSERT INTO tasks (project_id, title, status, stage_id) VALUES ($1,'Aguardando topografia','blocked',$2)
       RETURNING status`, [projeto.id, etapa])
    expect(rows[0].status).toBe('blocked')
  })

  it('blocked fica entre in_progress e in_review na ordem do enum', async () => {
    const { rows } = await query(
      `SELECT unnest(enum_range(NULL::task_status))::text AS v`)
    const ordem = rows.map((r) => r.v)
    expect(ordem.indexOf('blocked')).toBeGreaterThan(ordem.indexOf('in_progress'))
    expect(ordem.indexOf('blocked')).toBeLessThan(ordem.indexOf('in_review'))
  })

  it('a rota move a tarefa para blocked e de volta', async () => {
    const criada = await asUser(admin).post(`/projects/${projeto.id}/tasks`).send({ title: 'Implantação', stage_id: etapa })
    const bloqueada = await asUser(admin).put(`/tasks/${criada.body.id}/status`).send({ status: 'blocked' })
    expect(bloqueada.status).toBe(200)
    expect(bloqueada.body.status).toBe('blocked')

    const voltou = await asUser(admin).put(`/tasks/${criada.body.id}/status`).send({ status: 'in_progress' })
    expect(voltou.body.status).toBe('in_progress')
  })

  it('blocked entra na contagem por status', async () => {
    const criada = await asUser(admin).post(`/projects/${projeto.id}/tasks`).send({ title: 'X', stage_id: etapa })
    await asUser(admin).put(`/tasks/${criada.body.id}/status`).send({ status: 'blocked' })
    const res = await asUser(admin).get('/tasks/counts')
    expect(res.status).toBe(200)
    // /tasks/counts agrupa por projeto (uma linha por project_id) — não é o
    // formato que o teste original assumia (objeto único, sem stage_id). Isso
    // é pré-existente e não tem relação com a etapa obrigatória; só o acesso
    // ao índice estava errado.
    const linha = res.body.find((r) => r.project_id === projeto.id)
    expect(linha).toHaveProperty('blocked')
    expect(linha.blocked).toBe(1)
  })
})
