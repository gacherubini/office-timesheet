import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/write/proporCriarTask.js'

async function criarEtapa(projectId, name, position = 0) {
  const { rows } = await query(
    `INSERT INTO project_stages (project_id, name, position) VALUES ($1, $2, $3) RETURNING id, name`,
    [projectId, name, position],
  )
  return rows[0]
}

describe('tool propor_criar_task', () => {
  let emp, projeto, etapa
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee' })
    projeto = await makeProject({ name: 'Acme' })
    etapa = await criarEtapa(projeto.id, 'Anteprojeto')
  })

  it('propose descreve criar a tarefa no projeto e na etapa (única → automática)', async () => {
    const p = await tool.propose(emp, { projeto: 'Acme', titulo: 'Revisar layout' })
    expect(p.kind).toBe('criar_task')
    expect(p.payload.project_id).toBe(projeto.id)
    expect(p.payload.stage_id).toBe(etapa.id)
    expect(p.payload.title).toBe('Revisar layout')
    expect(p.payload.priority).toBe('medium') // default espelhado do endpoint
    expect(p.descricao).toMatch(/Revisar layout/)
    expect(p.descricao).toMatch(/Anteprojeto/)
    expect(p.dados.etapa).toBe('Anteprojeto')
    // propose NÃO muta.
    const { rows } = await query('SELECT COUNT(*)::int AS n FROM tasks WHERE project_id = $1', [projeto.id])
    expect(rows[0].n).toBe(0)
  })

  it('propose com etapa dita pelo nome resolve dentro do projeto', async () => {
    await criarEtapa(projeto.id, 'Executivo', 1)
    const p = await tool.propose(emp, { projeto: 'Acme', titulo: 'X', etapa: 'Executivo' })
    expect(p.dados.etapa).toBe('Executivo')
  })

  it('propose sem título → erro legível (título obrigatório)', async () => {
    await expect(tool.propose(emp, { projeto: 'Acme', titulo: '   ' })).rejects.toThrow(/título/i)
  })

  it('propose com prioridade inválida → erro (low/medium/high)', async () => {
    await expect(tool.propose(emp, { projeto: 'Acme', titulo: 'X', prioridade: 'urgente' }))
      .rejects.toThrow(/prioridade/i)
  })

  it('propose com projeto inexistente → erro legível', async () => {
    await expect(tool.propose(emp, { projeto: 'Nada', titulo: 'X' })).rejects.toThrow(/não encontrei/i)
  })

  // ── Resolução de etapa: os quatro caminhos do brief ─────────────────────

  it('caminho 1a: etapa dita mas AMBÍGUA no projeto → erro legível, não escolhe', async () => {
    await criarEtapa(projeto.id, 'Executivo civil', 1)
    await criarEtapa(projeto.id, 'Executivo elétrico', 2)
    await expect(tool.propose(emp, { projeto: 'Acme', titulo: 'X', etapa: 'Executivo' }))
      .rejects.toThrow(/mais de uma|especifique/i)
  })

  it('caminho 1b: etapa dita mas INEXISTENTE no projeto → erro legível', async () => {
    await expect(tool.propose(emp, { projeto: 'Acme', titulo: 'X', etapa: 'Maquete física' }))
      .rejects.toThrow(/não encontrei/i)
  })

  it('caminho 1c: mesmo nome de etapa existe em OUTRO projeto — não vaza a resolução', async () => {
    const outro = await makeProject({ name: 'Obra 2' })
    await criarEtapa(outro.id, 'Anteprojeto', 0)
    // "Anteprojeto" existe nos dois projetos, mas resolve só dentro de Acme.
    const p = await tool.propose(emp, { projeto: 'Acme', titulo: 'X', etapa: 'Anteprojeto' })
    expect(p.payload.stage_id).toBe(etapa.id)
  })

  it('caminho 2: etapa não dita e projeto tem só uma → usa automaticamente', async () => {
    const p = await tool.propose(emp, { projeto: 'Acme', titulo: 'X' })
    expect(p.payload.stage_id).toBe(etapa.id)
  })

  it('caminho 3 (o mais importante): etapa não dita e projeto tem VÁRIAS → recusa listando as etapas, não escolhe sozinho', async () => {
    await criarEtapa(projeto.id, 'Executivo', 1)
    await expect(tool.propose(emp, { projeto: 'Acme', titulo: 'X' })).rejects.toThrow(/Anteprojeto/)
    await expect(tool.propose(emp, { projeto: 'Acme', titulo: 'X' })).rejects.toThrow(/Executivo/)
    // Nenhuma tarefa foi criada em silêncio numa etapa "chutada".
    const { rows } = await query('SELECT COUNT(*)::int AS n FROM tasks WHERE project_id = $1', [projeto.id])
    expect(rows[0].n).toBe(0)
  })

  it('caminho 4: projeto sem etapa nenhuma → recusa dizendo que precisa criar etapas primeiro', async () => {
    const semEtapa = await makeProject({ name: 'Sem Etapas' })
    await expect(tool.propose(emp, { projeto: 'Sem Etapas', titulo: 'X' })).rejects.toThrow(/etapa/i)
    void semEtapa
  })

  // ── execute ──────────────────────────────────────────────────────────────

  it('execute cria a task no fim da coluna todo, com stage_id, e devolve antes/depois', async () => {
    // Já existe uma task em todo → a nova entra na position seguinte.
    await query(
      `INSERT INTO tasks (project_id, title, status, position, stage_id, created_by) VALUES ($1,'T0','todo',0,$2,$3)`,
      [projeto.id, etapa.id, emp.id],
    )
    const { before, after } = await tool.execute(emp, {
      project_id: projeto.id, stage_id: etapa.id, title: 'Nova', priority: 'high',
    })
    expect(before).toBeNull()
    expect(after.title).toBe('Nova')
    expect(after.status).toBe('todo')
    expect(after.priority).toBe('high')
    expect(after.position).toBe(1)
    expect(after.stage_id).toBe(etapa.id)
    expect(after.created_by).toBe(emp.id)
  })

  it('execute registra o histórico "created", igual à rota espelhada', async () => {
    const { after } = await tool.execute(emp, {
      project_id: projeto.id, stage_id: etapa.id, title: 'Com histórico', priority: 'medium',
    })
    const { rows } = await query(
      `SELECT type, actor_id, detail FROM task_activity WHERE task_id = $1`,
      [after.id],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('created')
    expect(rows[0].actor_id).toBe(emp.id)
    expect(rows[0].detail).toEqual({ title: 'Com histórico' })
  })

  it('execute revalida: projeto sumiu entre propor e aprovar → recusa', async () => {
    await query('DELETE FROM projects WHERE id = $1', [projeto.id])
    await expect(tool.execute(emp, { project_id: projeto.id, stage_id: etapa.id, title: 'X', priority: 'medium' }))
      .rejects.toThrow(/projeto/i)
  })

  it('execute revalida: etapa sumiu entre propor e aprovar (mas projeto continua) → recusa', async () => {
    await query('DELETE FROM project_stages WHERE id = $1', [etapa.id])
    await expect(tool.execute(emp, { project_id: projeto.id, stage_id: etapa.id, title: 'X', priority: 'medium' }))
      .rejects.toThrow(/etapa/i)
  })
})
