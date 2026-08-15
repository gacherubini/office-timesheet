import { describe, it, expect } from 'vitest'
import { buildRegistry } from '../../../lib/agent/tools/registry.js'

describe('registry — filtrado por papel', () => {
  it('admin recebe listar_equipe E encerrar apontamento', () => {
    const reg = buildRegistry({ role: 'admin' })
    const nomes = reg.definitions.map((d) => d.function.name)
    expect(nomes).toContain('listar_equipe')
    expect(nomes).toContain('propor_encerrar_apontamento')
    expect(reg.get('listar_equipe')).toBeDefined()
  })

  it('colaborador NÃO recebe a definição de listar_equipe', () => {
    const reg = buildRegistry({ role: 'employee' })
    const nomes = reg.definitions.map((d) => d.function.name)
    expect(nomes).not.toContain('listar_equipe')
    expect(nomes).toContain('propor_encerrar_apontamento') // esta é dele
    expect(reg.get('listar_equipe')).toBeUndefined()
  })
})

describe('registry — tools do M2 por papel', () => {
  it('admin recebe as tools de inteligência e as operacionais', () => {
    const nomes = buildRegistry({ role: 'admin' }).definitions.map((d) => d.function.name)
    for (const n of ['custo_por_projeto', 'carga_equipe', 'quem_nao_apontou', 'tasks_travadas', 'ferias_e_conflitos']) {
      expect(nomes).toContain(n)
    }
  })

  it('colaborador recebe só as operacionais (tasks/férias), não as de inteligência', () => {
    const nomes = buildRegistry({ role: 'employee' }).definitions.map((d) => d.function.name)
    expect(nomes).toContain('tasks_travadas')
    expect(nomes).toContain('ferias_e_conflitos')
    expect(nomes).not.toContain('custo_por_projeto')
    expect(nomes).not.toContain('carga_equipe')
    expect(nomes).not.toContain('quem_nao_apontou')
  })
})

describe('registry — tools do M3 (todos os papéis)', () => {
  const M3 = ['simulacao_performance', 'status_projeto', 'andamento_de_projeto']

  it('admin recebe as tools do M3', () => {
    const nomes = buildRegistry({ role: 'admin' }).definitions.map((d) => d.function.name)
    for (const n of M3) expect(nomes).toContain(n)
  })

  it('colaborador também recebe as três (são de todos os papéis)', () => {
    const nomes = buildRegistry({ role: 'employee' }).definitions.map((d) => d.function.name)
    for (const n of M3) expect(nomes).toContain(n)
  })
})

describe('registry — tools de escrita do M4 por papel', () => {
  it('todos os papéis recebem as duas tools de escrita novas', () => {
    for (const role of ['admin', 'administrative_intern', 'project_manager', 'employee']) {
      const nomes = buildRegistry({ role }).definitions.map((d) => d.function.name)
      expect(nomes).toContain('propor_criar_apontamento')
      expect(nomes).toContain('propor_criar_task')
    }
  })
})

describe('registry — consultar_dados é admin-only (M5)', () => {
  it('admin recebe consultar_dados', () => {
    const nomes = buildRegistry({ role: 'admin' }).definitions.map((d) => d.function.name)
    expect(nomes).toContain('consultar_dados')
  })

  it('nenhum papel não-admin recebe consultar_dados', () => {
    for (const role of ['employee', 'project_manager', 'administrative_intern']) {
      const nomes = buildRegistry({ role }).definitions.map((d) => d.function.name)
      expect(nomes).not.toContain('consultar_dados')
    }
  })
})

describe('registry — gerar_relatorio é admin-only', () => {
  it('admin recebe gerar_relatorio', () => {
    const nomes = buildRegistry({ role: 'admin' }).definitions.map((d) => d.function.name)
    expect(nomes).toContain('gerar_relatorio')
  })

  it('nenhum papel não-admin recebe gerar_relatorio', () => {
    for (const role of ['employee', 'project_manager', 'administrative_intern']) {
      const nomes = buildRegistry({ role }).definitions.map((d) => d.function.name)
      expect(nomes).not.toContain('gerar_relatorio')
    }
  })
})

describe('registry — despesas_do_periodo (admin + estagiário)', () => {
  it('admin e estagiário recebem; gestor e colaborador não', () => {
    for (const role of ['admin', 'administrative_intern']) {
      const nomes = buildRegistry({ role }).definitions.map((d) => d.function.name)
      expect(nomes).toContain('despesas_do_periodo')
    }
    for (const role of ['project_manager', 'employee']) {
      const nomes = buildRegistry({ role }).definitions.map((d) => d.function.name)
      expect(nomes).not.toContain('despesas_do_periodo')
    }
  })
})
