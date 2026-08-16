// O §18 do design chama isto de "teste de paridade" e diz que é o que sustenta
// a decisão do §3.1 (recorte por papel em código, sem RLS no Postgres). A
// pergunta é uma só: os papéis que a tool aceita são exatamente os que o
// endpoint espelhado aceita? Se a tool aceitar um papel a mais, o agente virou
// porta lateral para uma rota fechada.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { asUser } from '../../helpers/api.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import { buildRegistry } from '../../../lib/agent/tools/registry.js'

import listarEquipe from '../../../lib/agent/tools/read/listarEquipe.js'
import custoPorProjeto from '../../../lib/agent/tools/read/custoPorProjeto.js'
import cargaEquipe from '../../../lib/agent/tools/read/cargaEquipe.js'
import quemNaoApontou from '../../../lib/agent/tools/read/quemNaoApontou.js'
import tasksTravadas from '../../../lib/agent/tools/read/tasksTravadas.js'
import feriasEConflitos from '../../../lib/agent/tools/read/feriasEConflitos.js'
import simulacaoPerformance from '../../../lib/agent/tools/read/simulacaoPerformance.js'
import statusProjeto from '../../../lib/agent/tools/read/statusProjeto.js'
import andamentoDeProjeto from '../../../lib/agent/tools/read/andamentoDeProjeto.js'
import proporCriarApontamento from '../../../lib/agent/tools/write/proporCriarApontamento.js'
import proporEncerrarApontamento from '../../../lib/agent/tools/write/proporEncerrarApontamento.js'
import proporCriarTask from '../../../lib/agent/tools/write/proporCriarTask.js'
import despesasDoPeriodo from '../../../lib/agent/tools/read/despesasDoPeriodo.js'
import apontamentosAbertos from '../../../lib/agent/tools/read/apontamentosAbertos.js'
import aniversariantes from '../../../lib/agent/tools/read/aniversariantes.js'
import agendaDoPeriodo from '../../../lib/agent/tools/read/agendaDoPeriodo.js'
import proporPedirFerias from '../../../lib/agent/tools/write/proporPedirFerias.js'
import aprovacoesPendentes from '../../../lib/agent/tools/read/aprovacoesPendentes.js'
import proporLancarDespesa from '../../../lib/agent/tools/write/proporLancarDespesa.js'
import proporAprovarDespesa from '../../../lib/agent/tools/write/proporAprovarDespesa.js'
import proporRejeitarDespesa from '../../../lib/agent/tools/write/proporRejeitarDespesa.js'
import proporAprovarFerias from '../../../lib/agent/tools/write/proporAprovarFerias.js'
import proporRejeitarFerias from '../../../lib/agent/tools/write/proporRejeitarFerias.js'
import proporComentarTask from '../../../lib/agent/tools/write/proporComentarTask.js'
import proporMoverTask from '../../../lib/agent/tools/write/proporMoverTask.js'
import proporEditarTask from '../../../lib/agent/tools/write/proporEditarTask.js'
import meusBonus from '../../../lib/agent/tools/read/meusBonus.js'
import bonusDoPeriodo from '../../../lib/agent/tools/read/bonusDoPeriodo.js'
import proporLancarBonus from '../../../lib/agent/tools/write/proporLancarBonus.js'
import proporEditarBonus from '../../../lib/agent/tools/write/proporEditarBonus.js'
import proporApagarBonus from '../../../lib/agent/tools/write/proporApagarBonus.js'

const PAPEIS = ['admin', 'administrative_intern', 'project_manager', 'employee']

// Só 401/403 contam como negação de PAPEL. 400/404/409 são o endpoint
// funcionando e reclamando do corpo ou do estado — o papel passou.
const NEGADO = new Set([401, 403])

// Datas exigidas pelos relatórios financeiros (reports.js:98).
const JANELA = 'start_date=2020-01-01&end_date=2030-12-31'

// Cada entrada liga a tool aos endpoints que ela declara espelhar. `chamar`
// devolve uma lista de requests; o papel só é considerado permitido se NENHUM
// deles negar (o status_projeto espelha dois endpoints).
const CASOS = [
  { tool: listarEquipe, chamar: (u) => [asUser(u).get('/admin/users')] },
  { tool: custoPorProjeto, chamar: (u) => [asUser(u).get(`/admin/reports/project-cost?${JANELA}`)] },
  { tool: cargaEquipe, chamar: (u) => [asUser(u).get(`/admin/reports/financial?${JANELA}`)] },
  { tool: quemNaoApontou, chamar: (u) => [asUser(u).get(`/admin/reports/financial?${JANELA}`)] },
  { tool: tasksTravadas, chamar: (u) => [asUser(u).get('/tasks')] },
  { tool: feriasEConflitos, chamar: (u) => [asUser(u).get('/vacation-calendar')] },
  { tool: simulacaoPerformance, chamar: (u) => [asUser(u).get('/me/simulation?month=2026-03')] },
  { tool: statusProjeto, chamar: (u) => [asUser(u).get('/projects'), asUser(u).get('/tasks/counts')] },
  { tool: andamentoDeProjeto, chamar: (u) => [asUser(u).get('/tasks')] },
  {
    tool: proporCriarApontamento,
    chamar: (u, ctx) => [asUser(u).post('/time-entries/start').send({ project_id: ctx.projeto.id })],
  },
  { tool: proporEncerrarApontamento, chamar: (u) => [asUser(u).post('/time-entries/stop').send({})] },
  {
    tool: proporCriarTask,
    chamar: (u, ctx) => [asUser(u).post(`/projects/${ctx.projeto.id}/tasks`).send({ title: 'paridade' })],
  },
  { tool: despesasDoPeriodo, chamar: (u) => [asUser(u).get('/admin/expense-requests')] },
  { tool: apontamentosAbertos, chamar: (u) => [asUser(u).get('/admin/live')] },
  { tool: aniversariantes, chamar: (u) => [asUser(u).get('/me/team-birthdays')] },
  { tool: agendaDoPeriodo, chamar: (u) => [asUser(u).get('/me/calendar/events?start=2026-08-01&end=2026-08-07')] },
  {
    tool: proporPedirFerias,
    chamar: (u) => [asUser(u).post('/me/vacation-requests').send({ start_date: '2030-01-10', end_date: '2030-01-12' })],
  },
  {
    tool: aprovacoesPendentes,
    chamar: (u) => [
      asUser(u).get('/admin/expense-requests?status=pending'),
      asUser(u).get('/admin/vacation-requests?status=pending'),
    ],
  },
  {
    tool: proporLancarDespesa,
    chamar: (u) => [asUser(u).post('/me/expense-requests').send({ title: 'x', amount: 10, expense_date: '2026-08-14' })],
  },
  { tool: proporAprovarDespesa, chamar: (u, ctx) => [asUser(u).post(`/admin/expense-requests/${ctx.despesa.id}/approve`).send({})] },
  { tool: proporRejeitarDespesa, chamar: (u, ctx) => [asUser(u).post(`/admin/expense-requests/${ctx.despesa.id}/reject`).send({})] },
  { tool: proporAprovarFerias, chamar: (u, ctx) => [asUser(u).post(`/admin/vacation-requests/${ctx.ferias.id}/approve`).send({})] },
  { tool: proporRejeitarFerias, chamar: (u, ctx) => [asUser(u).post(`/admin/vacation-requests/${ctx.ferias.id}/reject`).send({})] },
  { tool: proporComentarTask, chamar: (u, ctx) => [asUser(u).post(`/tasks/${ctx.task.id}/comments`).send({ body: 'oi' })] },
  { tool: proporMoverTask, chamar: (u, ctx) => [asUser(u).put(`/tasks/${ctx.task.id}/status`).send({ status: 'in_progress' })] },
  { tool: proporEditarTask, chamar: (u, ctx) => [asUser(u).put(`/tasks/${ctx.task.id}`).send({ title: 'novo' })] },
  { tool: meusBonus, chamar: (u) => [asUser(u).get('/me/bonuses')] },
  { tool: bonusDoPeriodo, chamar: (u) => [asUser(u).get('/admin/bonuses')] },
  { tool: proporLancarBonus, chamar: (u, ctx) => [asUser(u).post('/admin/bonuses').send({ user_id: ctx.alvo.id, title: 'x', amount: 10, bonus_date: '2026-08-01' })] },
  { tool: proporEditarBonus, chamar: (u, ctx) => [asUser(u).put(`/admin/bonuses/${ctx.bonus.id}`).send({ user_id: ctx.alvo.id, title: 'x', amount: 10, bonus_date: '2026-08-01', description: null })] },
  { tool: proporApagarBonus, chamar: (u, ctx) => [asUser(u).delete(`/admin/bonuses/${ctx.bonus.id}`)] },
]

describe('paridade de papel: tool ↔ endpoint espelhado (§18)', () => {
  let usuarios, ctx
  beforeEach(async () => {
    await resetDb()
    usuarios = {}
    for (const papel of PAPEIS) {
      usuarios[papel] = await makeUser({ role: papel, name: `Papel ${papel}` })
    }
    const emp = usuarios.employee
    const { rows: desp } = await query(
      `INSERT INTO expense_requests (user_id, title, amount, expense_date, status)
       VALUES ($1,'Uber',10,'2026-08-14','pending') RETURNING id`,
      [emp.id],
    )
    const { rows: fer } = await query(
      `INSERT INTO vacation_requests (user_id, start_date, end_date, days_count, status)
       VALUES ($1, CURRENT_DATE, CURRENT_DATE + 2, 3, 'pending') RETURNING id`,
      [emp.id],
    )
    const projeto = await makeProject({ name: 'Paridade' })
    const { rows: taskRows } = await query(
      `INSERT INTO tasks (project_id, title, status, position) VALUES ($1,'Paridade','todo',0) RETURNING id`,
      [projeto.id],
    )
    const { rows: bonusRows } = await query(
      `INSERT INTO bonuses (user_id, title, amount, bonus_date, created_by)
       VALUES ($1,'Paridade',10,'2026-08-01',$2) RETURNING id`,
      [emp.id, usuarios.admin.id],
    )
    ctx = {
      projeto,
      task: taskRows[0],
      despesa: desp[0],
      ferias: fer[0],
      alvo: emp,
      bonus: bonusRows[0],
    }
  })

  for (const caso of CASOS) {
    const nome = caso.tool.definition.function.name
    it(`${nome}: aceita exatamente os papéis que ${caso.tool.espelha} aceita`, async () => {
      for (const papel of PAPEIS) {
        const respostas = await Promise.all(caso.chamar(usuarios[papel], ctx))
        const endpointPermite = respostas.every((r) => !NEGADO.has(r.status))
        const toolPermite = caso.tool.roles.includes(papel)
        expect(
          { papel, tool: toolPermite, endpoint: endpointPermite },
          `${nome} diverge de ${caso.tool.espelha} para o papel ${papel}`,
        ).toEqual({ papel, tool: endpointPermite, endpoint: endpointPermite })
      }
    })
  }

  it('toda tool com `espelha` está na tabela — nenhuma escapa do teste', () => {
    // O admin enxerga o catálogo inteiro, então é a régua da cobertura.
    const todas = buildRegistry({ role: 'admin' }).definitions.map((d) => d.function.name)
    const naTabela = new Set(CASOS.map((c) => c.tool.definition.function.name))
    // consultar_dados e registrar_pedido_nao_atendido têm espelha:null de
    // propósito — não há endpoint espelhado.
    const semEspelho = new Set(['consultar_dados', 'registrar_pedido_nao_atendido', 'gerar_relatorio'])
    const faltando = todas.filter((n) => !semEspelho.has(n) && !naTabela.has(n))
    expect(faltando).toEqual([])
  })
})
