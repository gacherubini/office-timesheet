import { describe, it, expect, beforeEach } from 'vitest'
import { carimbarContexto, lerContexto, dispensarContexto } from './agentContext.js'

beforeEach(() => {
  const store = new Map()
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  }
})

it('carimbar / ler', () => {
  carimbarContexto({ projectId: 'p1', projectName: 'Acme', taskCount: 3 })
  expect(lerContexto()).toMatchObject({ projectId: 'p1', projectName: 'Acme', taskCount: 3 })
})
it('dispensar faz ler voltar null; carimbar seguinte reativa', () => {
  carimbarContexto({ projectId: 'p1', projectName: 'Acme' })
  dispensarContexto()
  expect(lerContexto()).toBeNull()
  carimbarContexto({ projectId: 'p1', projectName: 'Acme' })
  expect(lerContexto().projectId).toBe('p1')
})
it('JSON corrompido → null', () => {
  sessionStorage.setItem('assistente:contexto', '{')
  expect(lerContexto()).toBeNull()
})
