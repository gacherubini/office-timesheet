/** @vitest-environment jsdom */
// PageHeader liga useDocumentTitle por dentro — nenhuma das 19 páginas que o
// usam chama o hook direto. Se essa linha sumir de PageHeader.jsx, a suíte
// do hook continua verde (ele nunca é chamado) e nada mais acusa a
// regressão: as 19 páginas perdem o título da aba em silêncio. Este teste
// existe para pegar exatamente essa remoção.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { PageHeader } from './PageHeader'

describe('PageHeader', () => {
  afterEach(cleanup)

  it('grava o título da página na aba do navegador', () => {
    render(<PageHeader title="Projetos" />)
    expect(document.title).toBe('Projetos · Gestão VOID')
  })

  it('título como nó JSX não vira "[object Object]" na aba', () => {
    document.title = 'Gestão VOID'
    render(<PageHeader title={<span>Projetos</span>} />)
    expect(document.title).toBe('Gestão VOID')
  })
})
