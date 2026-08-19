import { describe, expect, it } from 'vitest'
import { buildNav } from './nav'

const labels = (items) => items.map((i) => i.label)

describe('buildNav', () => {
  it('manda o colaborador para /dashboard e não aninha ferramentas de admin', () => {
    const nav = buildNav({})
    expect(nav[0]).toMatchObject({ label: 'Início', to: '/dashboard' })
    expect(labels(nav)).toEqual(['Início', 'Tarefas', 'Projetos', 'Pessoas', 'Agenda', 'Histórico', 'Assistente', 'Performance'])
    expect(nav.find((i) => i.label === 'Performance').children).toBeUndefined()
    expect(labels(nav.find((i) => i.label === 'Agenda').children)).toEqual(['Minhas férias'])
  })

  it('manda o admin para /admin/dashboard e aninha as cinco ferramentas', () => {
    const nav = buildNav({ isAdmin: true })
    expect(nav[0].to).toBe('/admin/dashboard')
    expect(labels(nav)).not.toContain('Histórico')
    expect(labels(nav.find((i) => i.label === 'Performance').children)).toEqual([
      'Relatórios',
      'Apontamentos',
      'Bônus',
      'Despesas',
      'Custos & Pedidos',
    ])
    expect(labels(nav.find((i) => i.label === 'Agenda').children)).toEqual(['Minhas férias'])
  })

  it('manda o estagiário administrativo para /admin/approvals e esconde Performance', () => {
    const nav = buildNav({ isAdministrativeIntern: true })
    expect(nav[0].to).toBe('/admin/approvals')
    expect(labels(nav)).not.toContain('Performance')
    expect(labels(nav)).toContain('Histórico')
    expect(labels(nav.find((i) => i.label === 'Agenda').children)).toEqual(['Minhas férias'])
  })

  it('sem canManageProjects, Projetos não tem submenu', () => {
    const nav = buildNav({})
    expect(nav.find((i) => i.label === 'Projetos').children).toBeUndefined()
  })

  it('com canManageProjects, Projetos ganha o Catálogo de etapas', () => {
    const nav = buildNav({ canManageProjects: true })
    expect(labels(nav.find((i) => i.label === 'Projetos').children)).toEqual(['Catálogo de etapas'])
    expect(nav.find((i) => i.label === 'Projetos').children[0].to).toBe('/catalogo-etapas')
  })
})
