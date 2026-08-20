/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Modal } from './Modal'

afterEach(cleanup)

// O que estes testes guardam (medido no navegador em 20/08/2026, formulário
// de pessoa aberto em PF):
//
//   painel 1016px de altura, viewport 889px
//   top -63 / bottom 953  → 64px cortados EM CIMA e 64px EMBAIXO
//   ancestral que rola: nenhum
//
// O backdrop centraliza com `items-center`, então conteúdo mais alto que a
// tela transborda para os dois lados, e sem ancestral rolável o pedaço de
// cima fica INALCANÇÁVEL — nem o título nem o botão de fechar dava para ver.
// O `overflow-hidden` do painel terminava o serviço cortando.
//
// jsdom não faz layout e não carrega o Tailwind, então não dá para medir aqui:
// estes testes prendem a ESTRUTURA que produz o layout certo (painel limitado,
// corpo rolável, cabeçalho e rodapé fora do que rola). A medição de verdade é
// no navegador — foi assim que o bug apareceu e foi assim que o fix foi
// conferido.

function abrir(props = {}) {
  return render(
    <Modal open title="Nova pessoa" onClose={() => {}} {...props}>
      <p>conteúdo do formulário</p>
    </Modal>,
  )
}

function painelDe(container) {
  // O backdrop é o nó raiz; o painel é o único filho dele.
  return container.firstElementChild.firstElementChild
}

describe('Modal — conteúdo mais alto que a tela', () => {
  it('o painel nunca passa da altura da janela', () => {
    const { container } = abrir()
    expect(painelDe(container).className).toMatch(/max-h-\[90vh\]/)
  })

  it('o corpo é quem rola, e é ele que carrega o conteúdo', () => {
    const { container } = abrir()
    const corpo = painelDe(container).querySelector('.overflow-y-auto')
    expect(corpo).toBeTruthy()
    expect(corpo.textContent).toContain('conteúdo do formulário')
  })

  it('o título e o botão de fechar ficam FORA do que rola', () => {
    // Some junto com o conteúdo se estiverem dentro da área rolável — que é
    // exatamente o que acontecia: o topo do painel saía da tela.
    const { container } = abrir()
    const corpo = painelDe(container).querySelector('.overflow-y-auto')
    expect(corpo.contains(screen.getByText('Nova pessoa'))).toBe(false)
    expect(corpo.contains(screen.getByRole('button'))).toBe(false)
  })

  it('o rodapé de ações também fica fora do que rola', () => {
    // Salvar/Cancelar não podem exigir rolar até o fim de um formulário longo.
    const { container } = abrir({ footer: <button>Salvar</button> })
    const corpo = painelDe(container).querySelector('.overflow-y-auto')
    expect(corpo.contains(screen.getByText('Salvar'))).toBe(false)
  })

  it('o painel empilha em coluna, senão o corpo não sabe até onde crescer', () => {
    const { container } = abrir()
    expect(painelDe(container).className).toMatch(/flex-col/)
  })
})
