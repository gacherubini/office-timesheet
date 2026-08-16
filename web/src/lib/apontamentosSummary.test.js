import { describe, expect, it } from 'vitest'
import {
  HORAS_LABEL,
  NET_LABEL,
  fixedSalaryNote,
} from './apontamentosSummary'

describe('rótulos da soma de apontamentos', () => {
  it('não chama a soma de horas de salário nem de líquido a pagar', () => {
    expect(HORAS_LABEL).toMatch(/horas/i)
    expect(HORAS_LABEL).not.toMatch(/salário base/i)
    expect(NET_LABEL).toMatch(/horas/i)
    expect(NET_LABEL).toMatch(/despesas/i)
    expect(NET_LABEL).toMatch(/bônus/i)
    expect(NET_LABEL).not.toMatch(/líquido/i)
  })
})

describe('fixedSalaryNote', () => {
  it('equipe inteira ou pessoa sem fixo → sem recado', () => {
    expect(fixedSalaryNote(null)).toBeNull()
    expect(fixedSalaryNote({ name: 'Ana', fixed_salary: 0 })).toBeNull()
    expect(fixedSalaryNote({ name: 'Ana' })).toBeNull()
  })

  it('pessoa com salário fixo: mostra o valor e diz que não entra na soma', () => {
    const note = fixedSalaryNote({ name: 'João', fixed_salary: 2000 })
    expect(note).toMatch(/R\$\s*2\.000,00/)
    expect(note).toMatch(/não entra nesta soma/i)
    expect(note).toMatch(/salário fixo/i)
  })
})
