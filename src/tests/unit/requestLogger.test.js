import { describe, it, expect } from 'vitest'
import { routeOf, levelFor } from '../../middleware/requestLogger.js'

describe('routeOf — padrão da rota, nunca a URL concreta', () => {
  it('rota simples na raiz', () => {
    expect(routeOf({ baseUrl: '', route: { path: '/projects' } })).toBe('/projects')
  })

  it('rota com parâmetro mantém o :id', () => {
    expect(routeOf({ baseUrl: '', route: { path: '/projects/:id/tasks' } }))
      .toBe('/projects/:id/tasks')
  })

  it('router montado com prefixo concatena o baseUrl', () => {
    expect(routeOf({ baseUrl: '/admin', route: { path: '/users/:id' } }))
      .toBe('/admin/users/:id')
  })

  it('request sem rota casada vira "unmatched"', () => {
    expect(routeOf({ baseUrl: '', route: undefined })).toBe('unmatched')
  })
})

describe('levelFor — nível derivado do status', () => {
  it('200 → info', () => expect(levelFor(200)).toBe('info'))
  it('201 → info', () => expect(levelFor(201)).toBe('info'))
  it('304 → info', () => expect(levelFor(304)).toBe('info'))
  it('400 → warn', () => expect(levelFor(400)).toBe('warn'))
  it('404 → warn', () => expect(levelFor(404)).toBe('warn'))
  it('499 → warn', () => expect(levelFor(499)).toBe('warn'))
  it('500 → error', () => expect(levelFor(500)).toBe('error'))
  it('503 → error', () => expect(levelFor(503)).toBe('error'))
})
