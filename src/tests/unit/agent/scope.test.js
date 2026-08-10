import { describe, it, expect } from 'vitest'
import { colunasVisiveis, linhasVisiveis } from '../../../lib/agent/scope.js'

const admin = { role: 'admin' }
const intern = { role: 'administrative_intern' }
const employee = { role: 'employee' }
const pm = { role: 'project_manager' }

describe('scope — colunas de users por papel', () => {
  it('admin enxerga as colunas de dinheiro', () => {
    const cols = colunasVisiveis(admin, 'users')
    expect(cols).toContain('hourly_rate')
    expect(cols).toContain('fixed_salary')
  })

  it('estagiário administrativo NÃO enxerga colunas de dinheiro', () => {
    const cols = colunasVisiveis(intern, 'users')
    expect(cols).not.toContain('hourly_rate')
    expect(cols).not.toContain('fixed_salary')
    expect(cols).toContain('name')
  })

  it('papéis sem acesso operacional recebem lista vazia', () => {
    expect(colunasVisiveis(employee, 'users')).toEqual([])
    expect(colunasVisiveis(pm, 'users')).toEqual([])
  })
})

describe('scope — linhas de users por papel', () => {
  it('operacional vê os não-deletados', () => {
    expect(linhasVisiveis(admin, 'users')).toEqual({ where: 'deleted_at IS NULL', params: [] })
  })

  it('não-operacional não vê nenhuma linha', () => {
    expect(linhasVisiveis(employee, 'users')).toEqual({ where: 'false', params: [] })
  })

  it('entidade desconhecida é erro (allowlist)', () => {
    expect(() => colunasVisiveis(admin, 'salaries')).toThrow()
  })
})
