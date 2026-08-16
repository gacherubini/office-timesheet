// src/tests/integration/agent/custoPorProjeto.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/read/custoPorProjeto.js'

// Apontamento concluído hoje, com custo explícito.
async function completedToday(userId, projectId, minutes, cost) {
  await query(
    `INSERT INTO time_entries (user_id, project_id, started_at, ended_at, status, duration_minutes, cost_snapshot)
     VALUES ($1,$2, now(), now(), 'completed', $3, $4)`,
    [userId, projectId, minutes, cost],
  )
}

describe('tool custo_por_projeto (admin)', () => {
  let admin, emp, projA, projB
  beforeEach(async () => {
    await resetDb()
    admin = await makeUser({ role: 'admin' })
    emp = await makeUser({ role: 'employee', hourly_rate: 100 })
    projA = await makeProject({ name: 'Projeto A' })
    projB = await makeProject({ name: 'Projeto B' })
    await completedToday(emp.id, projA.id, 120, 200)
    await completedToday(emp.id, projA.id, 60, 100)
    await completedToday(emp.id, projB.id, 30, 50)
  })

  it('agrega custo dos horistas por projeto, do maior pro menor', async () => {
    const { data } = await tool.run(admin, { periodo: 'mes' })
    const a = data.find((p) => p.projeto === 'Projeto A')
    const b = data.find((p) => p.projeto === 'Projeto B')
    expect(a.custo_horistas).toBe(300)
    expect(a.total_horas).toBe(3)
    expect(a.pessoas).toBe(1)
    expect(b.custo_horistas).toBe(50)
    expect(data[0].projeto).toBe('Projeto A') // ordenado por custo desc
  })

  it('conta apontamento das 22h no fuso SP como HOJE (fronteira no fuso, não em UTC)', async () => {
    // 22h de HOJE em SP = 01h de AMANHÃ em UTC. Comparar started_at com a data
    // NUA (resolvida em UTC na sessão) jogaria este apontamento para fora do dia.
    // A fronteira correta é AT TIME ZONE 'America/Sao_Paulo'.
    const projFuso = await makeProject({ name: 'Projeto Fuso' })
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, ended_at, status, duration_minutes, cost_snapshot)
       VALUES ($1, $2,
         (((now() AT TIME ZONE 'America/Sao_Paulo')::date + time '22:00') AT TIME ZONE 'America/Sao_Paulo'),
         now(), 'completed', 60, 77)`,
      [emp.id, projFuso.id],
    )
    const { data } = await tool.run(admin, { periodo: 'hoje' })
    const alvo = data.find((p) => p.projeto === 'Projeto Fuso')
    expect(alvo, 'apontamento das 22h SP deve entrar no dia de hoje').toBeTruthy()
    expect(alvo.custo_horistas).toBe(77)
  })

  it('apontamento das 22h de ONTEM em SP não entra em hoje', async () => {
    const projOntem = await makeProject({ name: 'Projeto Ontem' })
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, ended_at, status, duration_minutes, cost_snapshot)
       VALUES ($1, $2,
         ((((now() AT TIME ZONE 'America/Sao_Paulo')::date - interval '1 day') + time '22:00') AT TIME ZONE 'America/Sao_Paulo'),
         now(), 'completed', 60, 66)`,
      [emp.id, projOntem.id],
    )
    const { data } = await tool.run(admin, { periodo: 'hoje' })
    expect(data.find((p) => p.projeto === 'Projeto Ontem')).toBeFalsy()
  })

  it('não mescla dois projetos distintos com o mesmo nome e cliente', async () => {
    // projects.name não tem unique constraint; dois projetos podem ter o
    // mesmo nome (e cliente). O GROUP BY precisa incluir p.id pra não
    // colapsar as duas linhas numa só.
    const projC1 = await makeProject({ name: 'Duplicado' })
    const projC2 = await makeProject({ name: 'Duplicado' })
    await completedToday(emp.id, projC1.id, 10, 15)
    await completedToday(emp.id, projC2.id, 20, 25)

    const { data } = await tool.run(admin, { periodo: 'mes' })
    const duplicados = data.filter((p) => p.projeto === 'Duplicado')
    expect(duplicados).toHaveLength(2)
    const custos = duplicados.map((p) => p.custo_horistas).sort((a, b) => a - b)
    expect(custos).toEqual([15, 25])
  })
})
