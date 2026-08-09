import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/read/simulacaoPerformance.js'

// Hoje no fuso do estúdio — casa com o default da tool.
function hojeSP() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

describe('tool simulacao_performance (todos os papéis, dado próprio)', () => {
  let ana, bruno, proj, ym
  beforeEach(async () => {
    await resetDb()
    // R$100/h deixa a conta meta→horas legível: R$10.000 = 100h.
    ana = await makeUser({ role: 'employee', name: 'Ana', hourly_rate: 100 })
    bruno = await makeUser({ role: 'employee', name: 'Bruno', hourly_rate: 100 })
    proj = await makeProject({ name: 'P' })
    ym = hojeSP().slice(0, 7)
    await query(
      `INSERT INTO performance_simulations (user_id, ym, planned)
       VALUES ($1, $2, $3::jsonb)`,
      [ana.id, ym, JSON.stringify({ target_amount: 10000 })],
    )
    // Ana já apontou 180 min (3h) concluídos → R$300 dos R$10.000.
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, ended_at, status, duration_minutes, cost_snapshot)
       VALUES ($1, $2, now(), now(), 'completed', 180, 0)`,
      [ana.id, proj.id],
    )
    // Bruno tem a própria simulação — não deve vazar para a da Ana.
    await query(
      `INSERT INTO performance_simulations (user_id, ym, planned)
       VALUES ($1, $2, $3::jsonb)`,
      [bruno.id, ym, JSON.stringify({ target_amount: 9999 })],
    )
  })

  it('devolve meta, horas reais e as horas que faltam para a meta', async () => {
    const { data } = await tool.run(ana, {})
    expect(data.mes).toBe(ym)
    expect(data.tem_simulacao).toBe(true)
    expect(data.meta_ganho).toBe(10000)
    expect(data.horas_realizadas).toBe(3)
    expect(data.valor_realizado).toBe(300)
    expect(data.horas_para_bater_a_meta).toBe(97) // (10000 - 300) / 100
  })

  it('horas planejadas saem da META, não do mapa de overrides', async () => {
    // Regressão: a versão antiga somava só `overrides` e devolvia 0h aqui.
    // O valor exato depende de quantos dias úteis ainda faltam no mês corrente
    // (a conta fechada com datas fixas está em tests/unit/performanceSimulation);
    // aqui basta que as horas reais nunca sumam do planejado.
    const { data } = await tool.run(ana, {})
    expect(data.horas_planejadas).toBeGreaterThanOrEqual(data.horas_realizadas)
    expect(data.horas_planejadas).toBeGreaterThan(0)
    expect(data.horas_extras_de_fim_de_semana).toBe(0) // esta config não tem extra
  })

  it('sem simulação salva: meta zero, mas as horas reais continuam reais', async () => {
    const { data } = await tool.run(bruno, {})
    expect(data.tem_simulacao).toBe(true)
    const mesPassado = await tool.run(bruno, { mes: '2020-01' })
    expect(mesPassado.data.tem_simulacao).toBe(false)
    expect(mesPassado.data.meta_ganho).toBe(0)
    expect(mesPassado.data.horas_realizadas).toBe(0)
  })

  it('sem valor/hora no perfil, avisa em vez de anunciar 0h planejadas', async () => {
    const sem = await makeUser({ role: 'employee', name: 'Sem taxa', hourly_rate: null })
    await query(
      `INSERT INTO performance_simulations (user_id, ym, planned)
       VALUES ($1, $2, $3::jsonb)`,
      [sem.id, ym, JSON.stringify({ target_amount: 10000 })],
    )
    const { data } = await tool.run(sem, {})
    expect(data.valor_hora).toBe(0)
    expect(data.horas_para_bater_a_meta).toBe(0)
    expect(data.observacao).toMatch(/valor por hora/i)
  })

  it('não vaza a simulação de outra pessoa', async () => {
    const { data } = await tool.run(ana, {})
    expect(data.meta_ganho).not.toBe(9999)
  })
})
