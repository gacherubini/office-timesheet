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

it('carimba pessoa e devolve na leitura', () => {
  carimbarContexto({ personId: 'p1', personName: 'Luiz Eduardo' })
  const ctx = lerContexto()
  expect(ctx.personId).toBe('p1')
  expect(ctx.personName).toBe('Luiz Eduardo')
})

it('pessoa e projeto não se atropelam num carimbo só', () => {
  carimbarContexto({ projectId: 'pr1', projectName: 'Obra', personId: 'p1', personName: 'Luiz' })
  const ctx = lerContexto()
  expect(ctx.projectName).toBe('Obra')
  expect(ctx.personName).toBe('Luiz')
})

it('carimbo sem pessoa deixa os campos nulos, não ausentes', () => {
  carimbarContexto({ projectId: 'pr1', projectName: 'Obra' })
  const ctx = lerContexto()
  expect(ctx.personId).toBeNull()
  expect(ctx.personName).toBeNull()
})
