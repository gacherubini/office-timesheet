// Paridade de COLUNA, generalizada. Comparar Object.keys() com o endpoint só
// funciona para tool pass-through (listar_equipe); as demais renomeiam para
// português e agregam. O que o §18 quer pegar é o VALOR financeiro chegando a
// quem não pode ver, então plantamos valores improváveis no fixture e exigimos
// que não apareçam no JSON de nenhuma tool oferecida a papel não-admin.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import { buildRegistry } from '../../../lib/agent/tools/registry.js'

const SENTINELAS = {
  hourly_rate: 777.77,
  cost_snapshot: 999999,
  sale_value: 424242,
}

// Papéis que NÃO têm acesso a dinheiro (permissions.canAccessMoney = só admin).
const SEM_DINHEIRO = ['administrative_intern', 'project_manager', 'employee']

// Argumentos plausíveis por tool, para o `run` chegar até o fim em vez de parar
// num erro de parâmetro (que não exercitaria a query).
const ARGS = {
  status_projeto: { projeto: 'Sentinela' },
  andamento_de_projeto: { projeto: 'Sentinela' },
  simulacao_performance: {},
  tasks_travadas: {},
  ferias_e_conflitos: {},
  listar_equipe: {},
  custo_por_projeto: {},
  carga_equipe: {},
  quem_nao_apontou: {},
  despesas_do_periodo: {},
  apontamentos_abertos: {},
}

describe('paridade de coluna: valor financeiro não vaza por papel (§18)', () => {
  let projeto
  beforeEach(async () => {
    await resetDb()
    projeto = await makeProject({ name: 'Sentinela' })
    await query('UPDATE projects SET sale_value = $1 WHERE id = $2', [SENTINELAS.sale_value, projeto.id])
    const dono = await makeUser({ role: 'employee', name: 'Dono', hourly_rate: SENTINELAS.hourly_rate })
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, ended_at, status, duration_minutes, cost_snapshot)
       VALUES ($1, $2, now(), now(), 'completed', 60, $3)`,
      [dono.id, projeto.id, SENTINELAS.cost_snapshot],
    )
    await query(
      `INSERT INTO tasks (project_id, title, status, position) VALUES ($1, 'T', 'in_review', 0)`,
      [projeto.id],
    )
  })

  for (const papel of SEM_DINHEIRO) {
    it(`${papel}: nenhuma tool devolve valor financeiro plantado`, async () => {
      const perfil = await makeUser({ role: papel, name: `Quem ${papel}` })
      const registry = buildRegistry(perfil)

      for (const definicao of registry.definitions) {
        const nome = definicao.function.name
        const tool = registry.get(nome)
        if (tool.kind !== 'read') continue // escrita não devolve linha; é a Task 1 que cobre papel
        if (nome === 'consultar_dados') continue // admin-only; nunca cai aqui

        let saida
        try {
          saida = await tool.run(perfil, ARGS[nome] ?? {})
        } catch {
          continue // erro legível (ex.: projeto ambíguo) não é vazamento
        }
        const json = JSON.stringify(saida.data)
        for (const [coluna, valor] of Object.entries(SENTINELAS)) {
          expect(json, `${nome} vazou ${coluna} para ${papel}`).not.toContain(String(valor))
        }
      }
    })
  }

  it('admin: o sentinela APARECE — prova que o fixture chega às tools', async () => {
    const admin = await makeUser({ role: 'admin', name: 'Chefe' })
    const registry = buildRegistry(admin)
    const custo = await registry.get('custo_por_projeto').run(admin, {})
    expect(JSON.stringify(custo.data)).toContain(String(SENTINELAS.cost_snapshot))
  })
})
