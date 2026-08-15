import { describe, it, expect } from 'vitest'
import { aberturaDoPapel } from './agentOpening.js'

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
      'Quem está apontando agora?',
    ],
  },
  administrative_intern: {
    subtitulo: 'Posso te ajudar com aprovações e o dia a dia da equipe. Toda alteração passa por você.',
    chips: [
      'Quais despesas foram aprovadas este mês?',
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

describe('aberturaDoPapel', () => {
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
