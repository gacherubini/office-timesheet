import { describe, expect, it } from 'vitest'
import { buildNav } from './nav'

const labels = (items) => items.map((i) => i.label)

describe('buildNav', () => {
  it('manda o colaborador para /dashboard e não aninha ferramentas de admin', () => {
    const nav = buildNav({})
    expect(nav[0]).toMatchObject({ label: 'Início', to: '/dashboard' })
    expect(labels(nav)).toEqual(['Início', 'Tarefas', 'Projetos', 'Pessoas', 'Agenda', 'Performance'])
    expect(nav.find((i) => i.label === 'Performance').children).toBeUndefined()
  })

  it('manda o admin para /admin/dashboard e aninha as quatro ferramentas', () => {
    const nav = buildNav({ isAdmin: true })
    expect(nav[0].to).toBe('/admin/dashboard')
    expect(labels(nav.find((i) => i.label === 'Performance').children)).toEqual([
      'Relatórios',
      'Apontamentos',
      'Bônus',
      'Despesas',
    ])
  })

  it('manda o estagiário administrativo para /admin/approvals e esconde Performance', () => {
    const nav = buildNav({ isAdministrativeIntern: true })
    expect(nav[0].to).toBe('/admin/approvals')
    expect(labels(nav)).not.toContain('Performance')
  })
})
