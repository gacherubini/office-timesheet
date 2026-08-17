// Paridade de LINHA — o irmão do paridadeColuna.test.js. Lá a pergunta é "que
// COLUNA chega a este papel?" (dinheiro), e por isso o vazamento de HORA DE
// TERCEIRO passou batido: `total_horas` não é coluna financeira, é agregado de
// linhas de outras pessoas. Aqui a pergunta é "de QUEM são as linhas que chegam
// a este papel?": plantamos horas de outra pessoa e exigimos que elas não
// apareçam no JSON de nenhuma tool oferecida a quem não tem acesso a operações.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import { buildRegistry } from '../../../lib/agent/tools/registry.js'

// Minutos improváveis para o agregado ser reconhecível no JSON.
const MIN_TERCEIRO = 7777 // 129.62 h
const MIN_PROPRIO = 60 //     1 h
const SENTINELAS = {
  minutos_de_terceiro: MIN_TERCEIRO,
  horas_de_terceiro: '129.62',
  horas_do_time: '130.62', // terceiro + próprio: o agregado que vazava
}

// canAccessOperations = admin + estagiário administrativo. Estes dois papéis
// NÃO alcançam a operação, então nenhuma linha de outra pessoa é deles.
const SEM_OPERACOES = ['project_manager', 'employee']

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
  meus_bonus: {},
  agenda_do_periodo: { periodo: 'semana' },
  aniversariantes: {},
  aprovacoes_pendentes: {},
}

describe('paridade de linha: hora de terceiro não vaza para quem não é operação', () => {
  let projeto, terceiro
  beforeEach(async () => {
    await resetDb()
    projeto = await makeProject({ name: 'Sentinela' })
    terceiro = await makeUser({ role: 'employee', name: 'Terceiro' })
    await query(
      `INSERT INTO time_entries (user_id, project_id, started_at, ended_at, status, duration_minutes, cost_snapshot)
       VALUES ($1, $2, now(), now(), 'completed', $3, 0)`,
      [terceiro.id, projeto.id, MIN_TERCEIRO],
    )
  })

  for (const papel of SEM_OPERACOES) {
    it(`${papel}: nenhuma tool devolve hora apontada por outra pessoa`, async () => {
      const perfil = await makeUser({ role: papel, name: `Quem ${papel}` })
      // O próprio também apontou: o recorte tem que devolver ISTO, não zero.
      await query(
        `INSERT INTO time_entries (user_id, project_id, started_at, ended_at, status, duration_minutes, cost_snapshot)
         VALUES ($1, $2, now(), now(), 'completed', $3, 0)`,
        [perfil.id, projeto.id, MIN_PROPRIO],
      )
      const registry = buildRegistry(perfil)

      for (const definicao of registry.definitions) {
        const nome = definicao.function.name
        const tool = registry.get(nome)
        if (tool.kind !== 'read') continue

        let saida
        try {
          saida = await tool.run(perfil, ARGS[nome] ?? {})
        } catch (err) {
          throw new Error(`${nome} falhou para ${papel} (não é vazamento, mas o recorte não foi exercitado): ${err.message}`)
        }
        const json = JSON.stringify(saida.data)
        for (const [rotulo, valor] of Object.entries(SENTINELAS)) {
          expect(json, `${nome} vazou ${rotulo} para ${papel}`).not.toContain(String(valor))
        }
      }
    })

    it(`${papel}: status_projeto devolve as horas PRÓPRIAS, com rótulo que diz isso`, async () => {
      const perfil = await makeUser({ role: papel, name: `Quem ${papel}` })
      await query(
        `INSERT INTO time_entries (user_id, project_id, started_at, ended_at, status, duration_minutes, cost_snapshot)
         VALUES ($1, $2, now(), now(), 'completed', $3, 0)`,
        [perfil.id, projeto.id, MIN_PROPRIO],
      )
      const tool = buildRegistry(perfil).get('status_projeto')
      const { data } = await tool.run(perfil, { projeto: 'Sentinela' })
      expect(data).toHaveLength(1)
      // O rótulo é o dado: `total_horas` some, senão o modelo descreve o número
      // como "o total do projeto, de todo mundo".
      expect(data[0].minhas_horas).toBe(1)
      expect(data[0]).not.toHaveProperty('total_horas')
      expect(data[0].escopo_horas).toBe('proprio')
    })
  }

  it('operação (admin e estagiário): o agregado do time APARECE — nada foi quebrado', async () => {
    for (const papel of ['admin', 'administrative_intern']) {
      const perfil = await makeUser({ role: papel, name: `Quem ${papel}` })
      const tool = buildRegistry(perfil).get('status_projeto')
      const { data } = await tool.run(perfil, { projeto: 'Sentinela' })
      expect(data[0].total_horas, `${papel} deveria ver o agregado`).toBe(129.62)
      expect(data[0].escopo_horas).toBe('equipe')
    }
  })
})
