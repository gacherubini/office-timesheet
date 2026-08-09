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
