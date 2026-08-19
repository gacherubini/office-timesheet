/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { useDocumentTitle } from './useDocumentTitle'

describe('useDocumentTitle', () => {
  afterEach(cleanup)

  it('monta "Página · Gestão VOID"', () => {
    renderHook(() => useDocumentTitle('Projetos'))
    expect(document.title).toBe('Projetos · Gestão VOID')
  })

  it('sem título, fica só o nome do sistema', () => {
    renderHook(() => useDocumentTitle())
    expect(document.title).toBe('Gestão VOID')
  })

  it('string vazia também cai no nome do sistema', () => {
    renderHook(() => useDocumentTitle(''))
    expect(document.title).toBe('Gestão VOID')
  })

  it('reage à troca de título', () => {
    const { rerender } = renderHook(({ t }) => useDocumentTitle(t), {
      initialProps: { t: 'Projetos' },
    })
    expect(document.title).toBe('Projetos · Gestão VOID')
    rerender({ t: 'Pessoas' })
    expect(document.title).toBe('Pessoas · Gestão VOID')
  })

  // PageHeader aceita `title` como nó JSX em algumas telas; nesse caso não há
  // texto para pôr na aba e escrever "[object Object] · Gestão VOID" seria pior
  // que não fazer nada.
  it('ignora título que não seja string', () => {
    document.title = 'Gestão VOID'
    renderHook(() => useDocumentTitle(<span>Oi</span>))
    expect(document.title).toBe('Gestão VOID')
  })
})
