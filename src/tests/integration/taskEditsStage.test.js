// aplicarEdicaoTask (src/lib/taskEdits.js) precisa aceitar stage_id — o chip
// de etapa na tela de detalhe da tarefa já manda esse campo (PUT /tasks/:id),
// mas a função só reconhecia o antigo task_type (texto livre), que foi
// substituído por project_stages/tasks.stage_id (migrations 047-049) e
// removido do banco pela migration 051.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeAdmin, makeProject } from '../helpers/factories.js'

async function criarEtapa(projectId, name, position = 0) {
  const { rows } = await query(
    `INSERT INTO project_stages (project_id, name, position) VALUES ($1, $2, $3) RETURNING id, name`,
    [projectId, name, position],
  )
  return rows[0]
}

describe('PUT /tasks/:id — etapa (stage_id)', () => {
  let admin, projeto, outroProjeto, etapaA, etapaB, etapaOutroProjeto, tarefa

  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    projeto = await makeProject({ name: 'Obra 1' })
    outroProjeto = await makeProject({ name: 'Obra 2' })
    etapaA = await criarEtapa(projeto.id, 'Anteprojeto', 0)
    etapaB = await criarEtapa(projeto.id, 'Executivo', 1)
    etapaOutroProjeto = await criarEtapa(outroProjeto.id, 'Anteprojeto', 0)

    const criada = await asUser(admin)
      .post(`/projects/${projeto.id}/tasks`)
      .send({ title: 'Planta baixa', stage_id: etapaA.id })
    tarefa = criada.body
  })

  it('move a tarefa para outra etapa do MESMO projeto e persiste', async () => {
    const res = await asUser(admin).put(`/tasks/${tarefa.id}`).send({ stage_id: etapaB.id })

    expect(res.status).toBe(200)
    expect(res.body.stage_id).toBe(etapaB.id)

    const { rows } = await query('SELECT stage_id FROM tasks WHERE id = $1', [tarefa.id])
    expect(rows[0].stage_id).toBe(etapaB.id)
  })

  it('registra atividade de mudança de etapa', async () => {
    await asUser(admin).put(`/tasks/${tarefa.id}`).send({ stage_id: etapaB.id })

    const { rows } = await query(
      `SELECT type, detail FROM task_activity WHERE task_id = $1 AND type = 'stage_changed'`,
      [tarefa.id],
    )
    expect(rows.length).toBe(1)
    expect(rows[0].detail.from).toBe(etapaA.id)
    expect(rows[0].detail.to).toBe(etapaB.id)
  })

  // Bug real: o detail de stage_changed só guardava uuids (from/to). O
  // popover de histórico (web/src/pages/projectBoard/helpers.js) não tem
  // como traduzir um uuid de project_stages sozinho — vira "Ana ·
  // stage_changed" na tela. A correção grava também from_name/to_name.
  it('grava o NOME das etapas no detail da atividade, além dos ids', async () => {
    await asUser(admin).put(`/tasks/${tarefa.id}`).send({ stage_id: etapaB.id })

    const { rows } = await query(
      `SELECT detail FROM task_activity WHERE task_id = $1 AND type = 'stage_changed'`,
      [tarefa.id],
    )
    expect(rows.length).toBe(1)
    expect(rows[0].detail.from).toBe(etapaA.id)
    expect(rows[0].detail.to).toBe(etapaB.id)
    expect(rows[0].detail.from_name).toBe(etapaA.name)
    expect(rows[0].detail.to_name).toBe(etapaB.name)
  })

  it('não registra atividade quando a etapa enviada é a mesma que já estava', async () => {
    await asUser(admin).put(`/tasks/${tarefa.id}`).send({ stage_id: etapaA.id })

    const { rows } = await query(
      `SELECT type FROM task_activity WHERE task_id = $1 AND type = 'stage_changed'`,
      [tarefa.id],
    )
    expect(rows.length).toBe(0)
  })

  it('recusa etapa de OUTRO projeto com erro legível', async () => {
    const res = await asUser(admin).put(`/tasks/${tarefa.id}`).send({ stage_id: etapaOutroProjeto.id })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/etapa/i)

    const { rows } = await query('SELECT stage_id FROM tasks WHERE id = $1', [tarefa.id])
    expect(rows[0].stage_id).toBe(etapaA.id) // não mudou
  })

  it('recusa etapa inexistente com erro legível', async () => {
    const res = await asUser(admin)
      .put(`/tasks/${tarefa.id}`)
      .send({ stage_id: '00000000-0000-0000-0000-000000000000' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/etapa/i)
  })

  it('não aceita mais task_type — campo legado, substituído por stage_id', async () => {
    const res = await asUser(admin).put(`/tasks/${tarefa.id}`).send({ task_type: 'Conceituação' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Nenhum campo para atualizar.')

    // A coluna task_type nem existe mais (migration 051) — a única coisa que
    // resta conferir é que a tarefa não mudou de etapa.
    const { rows } = await query('SELECT stage_id FROM tasks WHERE id = $1', [tarefa.id])
    expect(rows[0].stage_id).toBe(etapaA.id)
  })

  it('priority, assignee_id e due_date continuam funcionando', async () => {
    const res = await asUser(admin).put(`/tasks/${tarefa.id}`).send({
      priority: 'high',
      assignee_id: admin.id,
      due_date: '2026-09-01',
    })

    expect(res.status).toBe(200)
    expect(res.body.priority).toBe('high')
    expect(res.body.assignee_id).toBe(admin.id)
    expect(String(res.body.due_date)).toMatch(/^2026-09-01/)
  })

  it('pode trocar etapa e prioridade no mesmo patch', async () => {
    const res = await asUser(admin).put(`/tasks/${tarefa.id}`).send({
      stage_id: etapaB.id,
      priority: 'low',
    })

    expect(res.status).toBe(200)
    expect(res.body.stage_id).toBe(etapaB.id)
    expect(res.body.priority).toBe('low')
  })
})
