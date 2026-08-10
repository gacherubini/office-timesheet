import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject, makeRunningEntry, makeApprovedVacation } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/write/proporCriarApontamento.js'

// "Hoje" no fuso do estúdio (America/Sao_Paulo), igual ao deFeriasHoje da tool.
// Usar a data em UTC (new Date().toISOString()) quebrava na janela 00:00–03:00Z,
// quando o dia UTC já virou mas o de SP ainda não — a data das férias não batia
// com (now() AT TIME ZONE 'America/Sao_Paulo')::date. 'en-CA' dá YYYY-MM-DD.
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

describe('tool propor_criar_apontamento', () => {
  let emp, projeto
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee', hourly_rate: 120 })
    projeto = await makeProject({ name: 'Acme' })
  })

  it('propose descreve iniciar o apontamento no projeto resolvido pelo nome', async () => {
    const p = await tool.propose(emp, { projeto: 'Acme' })
    expect(p.kind).toBe('criar_apontamento')
    expect(p.payload.project_id).toBe(projeto.id)
    expect(p.descricao).toMatch(/Acme/)
    // propose NÃO muta: nenhum apontamento foi criado.
    const { rows } = await query('SELECT COUNT(*)::int AS n FROM time_entries WHERE user_id = $1', [emp.id])
    expect(rows[0].n).toBe(0)
  })

  it('propose sem projeto → erro legível (pede o projeto)', async () => {
    await expect(tool.propose(emp, {})).rejects.toThrow(/qual projeto|projeto/i)
  })

  it('propose com nome que não existe → erro legível', async () => {
    await expect(tool.propose(emp, { projeto: 'Inexistente' })).rejects.toThrow(/não encontrei/i)
  })

  it('propose com nome ambíguo (dois projetos) → pede para especificar', async () => {
    await makeProject({ name: 'Acme Reforma' })
    await expect(tool.propose(emp, { projeto: 'Acme' })).rejects.toThrow(/mais de um|especifique|específic/i)
  })

  it('propose já com apontamento aberto → erro (não propõe segundo)', async () => {
    await makeRunningEntry({ user_id: emp.id, project_id: projeto.id, started_at: new Date() })
    await expect(tool.propose(emp, { projeto: 'Acme' })).rejects.toThrow(/já tem um apontamento aberto/i)
  })

  it('propose durante férias aprovadas hoje → erro (timer bloqueado)', async () => {
    const hoje = hojeSP()
    await makeApprovedVacation({ user_id: emp.id, start_date: hoje, end_date: hoje, days_count: 1 })
    await expect(tool.propose(emp, { projeto: 'Acme' })).rejects.toThrow(/férias/i)
  })

  it('execute cria o apontamento running e devolve antes/depois', async () => {
    const { before, after } = await tool.execute(emp, { project_id: projeto.id })
    expect(before.aberto).toBe(false)
    expect(after.status).toBe('running')
    expect(after.project_id).toBe(projeto.id)
    const { rows } = await query(
      `SELECT status FROM time_entries WHERE user_id = $1 AND project_id = $2`,
      [emp.id, projeto.id],
    )
    expect(rows[0].status).toBe('running')
  })

  it('execute revalida: já há apontamento aberto AGORA → recusa e não cria outro', async () => {
    await makeRunningEntry({ user_id: emp.id, project_id: projeto.id, started_at: new Date() })
    await expect(tool.execute(emp, { project_id: projeto.id })).rejects.toThrow(/já tem um apontamento aberto/i)
    const { rows } = await query(`SELECT COUNT(*)::int AS n FROM time_entries WHERE user_id = $1`, [emp.id])
    expect(rows[0].n).toBe(1) // só o que já existia
  })

  it('execute revalida: entrou de férias entre propor e aprovar → recusa', async () => {
    const hoje = hojeSP()
    await makeApprovedVacation({ user_id: emp.id, start_date: hoje, end_date: hoje, days_count: 1 })
    await expect(tool.execute(emp, { project_id: projeto.id })).rejects.toThrow(/férias/i)
    const { rows } = await query(`SELECT COUNT(*)::int AS n FROM time_entries WHERE user_id = $1`, [emp.id])
    expect(rows[0].n).toBe(0)
  })

  it('execute notifica os admins, igual ao POST /time-entries/start (§8.3)', async () => {
    // Paridade de COMPORTAMENTO: a rota espelhada dispara notifyAdmins ao iniciar.
    const admin = await makeUser({ role: 'admin', name: 'Chefe' })
    await tool.execute(emp, { project_id: projeto.id })
    const { rows } = await query(
      `SELECT type, project_id, actor_id FROM notifications WHERE user_id = $1`,
      [admin.id],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('time_entry_started')
    expect(rows[0].project_id).toBe(projeto.id)
    expect(rows[0].actor_id).toBe(emp.id)
  })
})
