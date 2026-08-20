import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeAdmin, makeUser, makeProject } from '../helpers/factories.js'

describe('API de etapas', () => {
  let admin, emp, projeto, etapa
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    emp = await makeUser({ role: 'employee', name: 'Ana' })
    projeto = await makeProject({ name: 'Grand Terroir 31' })
    const { rows } = await query(
      `INSERT INTO project_stages (project_id, name, position) VALUES ($1,'Anteprojeto',50) RETURNING id`,
      [projeto.id])
    etapa = rows[0].id
  })

  it('lista as etapas do projeto na ordem', async () => {
    await query(`INSERT INTO project_stages (project_id, name, position) VALUES ($1,'Conceituação',10)`, [projeto.id])
    const res = await asUser(emp).get(`/projects/${projeto.id}/stages`)
    expect(res.status).toBe(200)
    expect(res.body.map((s) => s.name)).toEqual(['Conceituação', 'Anteprojeto'])
  })

  // "Progresso calculado pelas tarefas concluídas (ex.: 5 de 11)" — o exemplo
  // do próprio PDF.
  it('calcula 5 de 11', async () => {
    for (let i = 0; i < 11; i++) {
      await query(
        `INSERT INTO tasks (project_id, stage_id, title, status) VALUES ($1,$2,$3,$4)`,
        [projeto.id, etapa, `T${i}`, i < 5 ? 'done' : 'todo'])
    }
    const res = await asUser(emp).get(`/projects/${projeto.id}/stages`)
    const a = res.body.find((s) => s.name === 'Anteprojeto')
    expect(a.done_count).toBe(5)
    expect(a.task_count).toBe(11)
  })

  it('etapa sem tarefa devolve 0 de 0, não nulo', async () => {
    const res = await asUser(emp).get(`/projects/${projeto.id}/stages`)
    const a = res.body.find((s) => s.name === 'Anteprojeto')
    expect(a.done_count).toBe(0)
    expect(a.task_count).toBe(0)
  })

  // "O sistema consegue somar quantas horas cada etapa consumiu... não exige
  // trabalho adicional além do vínculo tarefa → etapa" (PDF).
  it('soma as horas das tarefas da etapa', async () => {
    const { rows: t } = await query(
      `INSERT INTO tasks (project_id, stage_id, title) VALUES ($1,$2,'Planta') RETURNING id`,
      [projeto.id, etapa])
    await query(
      `INSERT INTO task_time_logs (task_id, user_id, started_at, ended_at, duration_minutes)
       VALUES ($1,$2,now(),now(),90), ($1,$2,now(),now(),30)`, [t[0].id, emp.id])
    const res = await asUser(emp).get(`/projects/${projeto.id}/stages`)
    expect(res.body.find((s) => s.name === 'Anteprojeto').total_minutes).toBe(120)
  })

  it('cria etapa a partir do catálogo, herdando nome e ordem', async () => {
    const { rows: cat } = await query(
      `INSERT INTO stage_catalog (name, position) VALUES ('Executivo', 90) RETURNING id`)
    const res = await asUser(admin).post(`/projects/${projeto.id}/stages`).send({ catalog_id: cat[0].id })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Executivo')
    expect(res.body.position).toBe(90)
    expect(res.body.catalog_id).toBe(cat[0].id)
  })

  it('cria etapa extra fora do catálogo', async () => {
    const res = await asUser(admin).post(`/projects/${projeto.id}/stages`).send({ name: 'Maquete física' })
    expect(res.status).toBe(201)
    expect(res.body.catalog_id).toBeNull()
  })

  it('atualiza prazo, responsável e status', async () => {
    const res = await asUser(admin).put(`/projects/${projeto.id}/stages/${etapa}`).send({
      due_date: '2026-08-24', owner_id: emp.id, status: 'em_andamento',
    })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('em_andamento')
    expect(res.body.owner_id).toBe(emp.id)
  })

  it('recusa status inválido', async () => {
    const res = await asUser(admin).put(`/projects/${projeto.id}/stages/${etapa}`).send({ status: 'quase' })
    expect(res.status).toBe(400)
  })

  // RESTRICT com mensagem legível, não erro de constraint cru.
  it('não apaga etapa com tarefa dentro — e diz quantas', async () => {
    await query(`INSERT INTO tasks (project_id, stage_id, title) VALUES ($1,$2,'Planta'), ($1,$2,'Cortes')`,
      [projeto.id, etapa])
    const res = await asUser(admin).delete(`/projects/${projeto.id}/stages/${etapa}`)
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/2 tarefa/i)
  })

  it('apaga etapa vazia', async () => {
    const res = await asUser(admin).delete(`/projects/${projeto.id}/stages/${etapa}`)
    expect(res.status).toBe(200)
  })

  it('colaborador não cria nem apaga etapa', async () => {
    expect((await asUser(emp).post(`/projects/${projeto.id}/stages`).send({ name: 'X' })).status).toBe(403)
    expect((await asUser(emp).delete(`/projects/${projeto.id}/stages/${etapa}`)).status).toBe(403)
  })

  it('a criação de tarefa EXIGE etapa', async () => {
    const res = await asUser(emp).post(`/projects/${projeto.id}/tasks`).send({ title: 'Sem etapa' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/etapa/i)
  })

  it('a criação aceita etapa e devolve stage_id', async () => {
    const res = await asUser(emp).post(`/projects/${projeto.id}/tasks`).send({ title: 'Planta', stage_id: etapa })
    expect(res.status).toBe(201)
    expect(res.body.stage_id).toBe(etapa)
  })

  it('recusa etapa de OUTRO projeto', async () => {
    const outro = await makeProject({ name: 'Casa 2' })
    const { rows } = await query(
      `INSERT INTO project_stages (project_id, name) VALUES ($1,'Executivo') RETURNING id`, [outro.id])
    const res = await asUser(emp).post(`/projects/${projeto.id}/tasks`).send({ title: 'X', stage_id: rows[0].id })
    expect(res.status).toBe(400)
  })

  it('o catálogo é listado sem as arquivadas', async () => {
    await query(`INSERT INTO stage_catalog (name, position) VALUES ('Ativa', 10), ('Velha', 20)`)
    await query(`UPDATE stage_catalog SET is_archived = true WHERE name = 'Velha'`)
    const res = await asUser(admin).get('/stage-catalog')
    expect(res.body.map((s) => s.name)).toContain('Ativa')
    expect(res.body.map((s) => s.name)).not.toContain('Velha')
  })

  // A tela de administração (StageCatalogPage) precisa reativar etapas
  // arquivadas — sem isto elas somem para sempre da interface.
  it('com include_archived=1 traz arquivada e não-arquivada, com is_archived no payload', async () => {
    await query(`INSERT INTO stage_catalog (name, position) VALUES ('Ativa', 10), ('Velha', 20)`)
    await query(`UPDATE stage_catalog SET is_archived = true WHERE name = 'Velha'`)
    const res = await asUser(admin).get('/stage-catalog?include_archived=1')
    expect(res.status).toBe(200)
    const porNome = Object.fromEntries(res.body.map((s) => [s.name, s]))
    expect(porNome.Ativa.is_archived).toBe(false)
    expect(porNome.Velha.is_archived).toBe(true)
  })

  it('só quem gerencia projetos edita o catálogo', async () => {
    const res = await asUser(emp).post('/stage-catalog').send({ name: 'Nova' })
    expect(res.status).toBe(403)
  })

  // Nome duplicado bate num UNIQUE do banco. Sem tradução, a tela mostra
  // `duplicate key value violates unique constraint "project_stages_project_id_name_key"`
  // — jargão que não diz à pessoa o que fazer. O DELETE ao lado já tem esse
  // cuidado (conta as tarefas antes de deixar o RESTRICT estourar); estes dois
  // POST não tinham.
  it('etapa repetida no mesmo projeto explica o problema em português', async () => {
    const res = await asUser(admin).post(`/projects/${projeto.id}/stages`).send({ name: 'Anteprojeto' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/já (existe|tem)/i)
    expect(res.body.error).toContain('Anteprojeto')
    expect(res.body.error).not.toMatch(/duplicate key|constraint/i)
  })

  it('o MESMO nome de etapa em outro projeto continua valendo', async () => {
    const outra = await makeProject({ name: 'Outra obra' })
    const res = await asUser(admin).post(`/projects/${outra.id}/stages`).send({ name: 'Anteprojeto' })
    expect(res.status).toBe(201)
  })

  it('nome repetido no catálogo explica o problema em português', async () => {
    await query(`INSERT INTO stage_catalog (name, position) VALUES ('Maquete física', 200)`)
    const res = await asUser(admin).post('/stage-catalog').send({ name: 'Maquete física' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/já (existe|tem)/i)
    expect(res.body.error).not.toMatch(/duplicate key|constraint/i)
  })

  // Renomear colide no mesmo UNIQUE que criar — e é o caminho mais provável
  // de dar colisão, porque quem renomeia não está olhando a lista inteira.
  it('renomear etapa para um nome que já existe no projeto também explica', async () => {
    await query(`INSERT INTO project_stages (project_id, name, position) VALUES ($1,'Executivo',90)`, [projeto.id])
    const res = await asUser(admin).put(`/projects/${projeto.id}/stages/${etapa}`).send({ name: 'Executivo' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/já (existe|tem)/i)
    expect(res.body.error).not.toMatch(/duplicate key|constraint/i)
  })

  it('renomear etapa do catálogo para um nome existente também explica', async () => {
    await query(`INSERT INTO stage_catalog (name, position) VALUES ('Uma', 10), ('Outra', 20)`)
    const { rows } = await query(`SELECT id FROM stage_catalog WHERE name = 'Uma'`)
    const res = await asUser(admin).put(`/stage-catalog/${rows[0].id}`).send({ name: 'Outra' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/já (existe|tem)/i)
    expect(res.body.error).not.toMatch(/duplicate key|constraint/i)
  })
})
