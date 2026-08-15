import { describe, it, expect } from 'vitest'
import { sugerirProximos } from '../../../lib/agent/suggestions.js'
import { aberturaDoPapel } from '../../../lib/agent/opening.js'

const emp = { id: 'e', role: 'employee' }
const admin = { id: 'a', role: 'admin' }

const PROIBIDO = {
  employee: [/reembolso/i, /lançar um bônus/i, /custou/i, /aprova/i],
  administrative_intern: [/lançar um bônus/i, /custou/i, /reembolso/i],
  project_manager: [/lançar um bônus/i, /aprova/i],
}

const ESPERADO = {
  admin: {
    subtitulo: 'Posso cruzar horas, custo e pendências — ou gerar um arquivo. Toda alteração passa por você.',
    chips: [
      'Quem não apontou esta semana?',
      'Lançar um bônus',
      'Quais aprovações estão pendentes?',
    ],
  },
  administrative_intern: {
    subtitulo: 'Posso te ajudar com aprovações e o dia a dia da equipe. Toda alteração passa por você.',
    chips: [
      'O que está pendente de aprovação?',
      'Quem está apontando agora?',
      'Quem está de férias esta semana?',
    ],
  },
  project_manager: {
    subtitulo: 'Posso olhar projetos, tarefas e o andamento do time. Toda alteração passa por você.',
    chips: [
      'Quais projetos estão ativos?',
      'Tarefas travadas em revisão?',
      'Quais foram meus bônus?',
    ],
  },
  employee: {
    subtitulo: 'Posso consultar seus apontamentos, tarefas, bônus e pedir férias. Toda alteração passa por você.',
    chips: [
      'Quantas horas lancei este mês?',
      'Quais foram meus bônus?',
      'Quero pedir férias',
    ],
  },
}

describe('sugerirProximos', () => {
  it('proposal → []', () => {
    expect(sugerirProximos({ profile: admin, lastKind: 'proposal', lastTools: ['propor_criar_task'] })).toEqual([])
  })
  it('sem contexto, depois de status_projeto: 2 strings da tabela, sem vazar custo pro employee', () => {
    const items = sugerirProximos({ profile: emp, lastTools: ['status_projeto'], lastKind: 'answer' })
    expect(items.length).toBeGreaterThanOrEqual(2)
    expect(items.length).toBeLessThanOrEqual(3)
    expect(items.join(' ')).not.toMatch(/custou/i)
  })
  it('com contexto de projeto, a primeira é âncora com o nome', () => {
    const items = sugerirProximos({
      profile: emp,
      context: { projeto: { name: 'Acme' } },
      lastTools: [],
      lastKind: 'answer',
    })
    expect(items[0]).toMatch(/Acme/)
  })
  it('não repete a última mensagem do usuário (normalize)', () => {
    const items = sugerirProximos({
      profile: emp,
      lastTools: [],
      lastKind: 'answer',
      ultimaMensagemUsuario: 'Quantas horas lancei este mês?',
    })
    expect(items.map((s) => s.toLowerCase().trim())).not.toContain('quantas horas lancei este mês?')
  })
  it('admin depois de andamento_de_projeto pode sugerir quem não apontou; employee não', () => {
    const a = sugerirProximos({ profile: admin, lastTools: ['andamento_de_projeto'], lastKind: 'answer' })
    const e = sugerirProximos({ profile: emp, lastTools: ['andamento_de_projeto'], lastKind: 'answer' })
    expect(a.join(' ')).toMatch(/não apontou/i)
    expect(e.join(' ')).not.toMatch(/não apontou/i)
  })
})

describe('aberturaDoPapel (servidor, mesma matriz)', () => {
  for (const role of ['admin', 'administrative_intern', 'project_manager', 'employee']) {
    it(`${role} tem 3 chips e subtítulo`, () => {
      const a = aberturaDoPapel(role)
      expect(a.chips).toHaveLength(3)
      expect(a.subtitulo.length).toBeGreaterThan(10)
      for (const re of PROIBIDO[role] || []) {
        expect([...a.chips, a.subtitulo].join(' ')).not.toMatch(re)
      }
    })

    it(`${role} casa a matriz de chips (espelho)`, () => {
      expect(aberturaDoPapel(role)).toEqual(ESPERADO[role])
    })
  }
})
