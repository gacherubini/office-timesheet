import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/read/andamentoDeProjeto.js'

describe('tool andamento_de_projeto (todos os papéis)', () => {
  let ana, proj, taskId
  beforeEach(async () => {
    await resetDb()
    ana = await makeUser({ role: 'employee', name: 'Ana' })
    proj = await makeProject({ name: 'P' })
    const { rows: etapas } = await query(
      `INSERT INTO project_stages (project_id, name) VALUES ($1,'Anteprojeto') RETURNING id`, [proj.id])
    const t = await query(
      `INSERT INTO tasks (project_id, title, status, position, stage_id) VALUES ($1,'Tarefa X','in_progress',0,$2) RETURNING id`,
      [proj.id, etapas[0].id],
    )
    taskId = t.rows[0].id
    // Tudo com now() → cai na semana corrente.
    await query(
      `INSERT INTO task_comments (task_id, author_id, body) VALUES ($1,$2,'oi')`,
      [taskId, ana.id],
    )
    await query(
      `INSERT INTO task_attachments (task_id, uploaded_by, file_url, file_name) VALUES ($1,$2,'u','f.png')`,
      [taskId, ana.id],
    )
    await query(
      `INSERT INTO task_activity (task_id, actor_id, type, detail) VALUES ($1,$2,'status_change','{}'::jsonb)`,
      [taskId, ana.id],
    )
  })

  it('conta comentários, anexos e atividade da semana e lista os itens de atividade', async () => {
    const { data } = await tool.run(ana, { projeto: 'P', periodo: 'semana' })
    expect(data.projeto).toBe('P')
    expect(data.novos_comentarios).toBe(1)
    expect(data.novos_anexos).toBe(1)
    expect(data.atividades).toBe(1)
    expect(data.itens_truncados).toBe(false)
    expect(data.ultimas_atividades[0].tarefa).toBe('Tarefa X')
    expect(data.ultimas_atividades[0].tipo).toBe('status_change')
  })

  it('a contagem é o total do período, não o teto da lista', async () => {
    // 25 atividades > os 20 itens que a lista devolve.
    for (let i = 0; i < 24; i++) {
      await query(
        `INSERT INTO task_activity (task_id, actor_id, type, detail) VALUES ($1,$2,'status_change','{}'::jsonb)`,
        [taskId, ana.id],
      )
    }
    const { data, count } = await tool.run(ana, { projeto: 'P', periodo: 'semana' })
    expect(data.atividades).toBe(25) // e não 20
    expect(count).toBe(25)
    expect(data.ultimas_atividades).toHaveLength(20)
    expect(data.itens_truncados).toBe(true)
  })

  it('projeto pelo nome: inexistente vira erro legível, não erro cru de uuid', async () => {
    await expect(tool.run(ana, { projeto: 'Nada' })).rejects.toThrow(/não encontrei/i)
  })

  it('conta atividade das 22h no fuso SP como HOJE (fronteira no fuso, não em UTC)', async () => {
    // 22h de HOJE em SP = 01h de AMANHÃ em UTC. Com created_at comparado à data
    // nua (UTC) a atividade cairia fora do dia; a fronteira certa é no fuso SP.
    const projFuso = await makeProject({ name: 'Fuso' })
    const { rows: etapasFuso } = await query(
      `INSERT INTO project_stages (project_id, name) VALUES ($1,'Anteprojeto') RETURNING id`, [projFuso.id])
    const tf = await query(
      `INSERT INTO tasks (project_id, title, status, position, stage_id) VALUES ($1,'TF','todo',0,$2) RETURNING id`,
      [projFuso.id, etapasFuso[0].id],
    )
    await query(
      `INSERT INTO task_activity (task_id, actor_id, type, detail, created_at)
       VALUES ($1,$2,'status_change','{}'::jsonb,
         (((now() AT TIME ZONE 'America/Sao_Paulo')::date + time '22:00') AT TIME ZONE 'America/Sao_Paulo'))`,
      [tf.rows[0].id, ana.id],
    )
    const { data } = await tool.run(ana, { projeto: 'Fuso', periodo: 'hoje' })
    expect(data.atividades).toBe(1)
    expect(data.ultimas_atividades).toHaveLength(1)
  })
})
