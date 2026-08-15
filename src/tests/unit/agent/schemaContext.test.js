import { describe, it, expect, beforeEach } from 'vitest'
import { esquemaAdmin, _resetCacheEsquema } from '../../../lib/agent/schemaContext.js'

// O banco de teste tem todas as migrations aplicadas, então o catálogo real
// existe. O esquema é derivado dele (fonte da verdade), recortado na allowlist.
describe('schemaContext', () => {
  beforeEach(() => _resetCacheEsquema())

  it('descreve as tabelas da allowlist com colunas reais', async () => {
    const txt = await esquemaAdmin()
    expect(txt).toContain('time_entries')
    expect(txt).toContain('cost_snapshot') // coluna financeira real de time_entries
    expect(txt).toContain('projects')
    expect(txt).toContain('users')
  })

  it('NÃO inclui tabela fora da allowlist', async () => {
    const txt = await esquemaAdmin()
    expect(txt).not.toContain('agent_usage')
    expect(txt).not.toContain('_migrations')
    expect(txt).not.toContain('notifications')
  })

  it('inclui relacionamentos (foreign keys) entre tabelas do domínio', async () => {
    const txt = await esquemaAdmin()
    // time_entries referencia users e projects — o mapa de FK precisa mostrar isso.
    expect(txt).toMatch(/time_entries\.\w+\s*→\s*(users|projects)/)
  })

  it('resolve os enums em valores reais (nada de USER-DEFINED cru)', async () => {
    const txt = await esquemaAdmin()
    expect(txt).not.toContain('USER-DEFINED')
    expect(txt).toMatch(/enum\([^)]+\)/) // ex.: status enum(active|paused|...)
  })

  it('cacheia: a segunda chamada devolve a mesma string sem reconsultar', async () => {
    const a = await esquemaAdmin()
    const b = await esquemaAdmin()
    expect(b).toBe(a)
  })
})
