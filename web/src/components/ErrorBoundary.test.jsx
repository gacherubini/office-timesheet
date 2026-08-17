/** @vitest-environment jsdom */
// O bug que motivou este componente: `Check` era usado no bloco "Proposta
// aprovada" e nunca foi importado. Como só renderiza depois de uma aprovação
// bem-sucedida, o ReferenceError só aparecia ao confirmar uma ação — e sem
// boundary a árvore React inteira caía, deixando a página BRANCA. Sem
// mensagem, sem botão, sem pista do que aconteceu.
//
// O teste renderiza um crash de verdade, porque um boundary que não pega é
// pior que nenhum: dá sensação de segurança sem a segurança.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

function Explode() {
  throw new ReferenceError("Can't find variable: Check")
}

function Paz() {
  return <p>conteúdo normal</p>
}

afterEach(() => {
  // Sem os globals do testing-library o cleanup automático não é registrado:
  // sem isto, o DOM do teste anterior fica montado e a busca acha dois nós.
  cleanup()
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('não atrapalha quando nada quebra', () => {
    render(<ErrorBoundary><Paz /></ErrorBoundary>)
    expect(screen.getByText('conteúdo normal')).toBeTruthy()
  })

  it('mostra uma tela com mensagem em vez de página branca', () => {
    // O React loga o erro no console por conta própria; silenciamos para a
    // saída do teste não parecer falha.
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<ErrorBoundary><Explode /></ErrorBoundary>)

    // O que o usuário vê: alguma coisa. Este é o ponto do componente.
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText(/algo quebrou/i)).toBeTruthy()
    // E uma saída — página branca não tem botão nenhum.
    expect(screen.getByRole('button', { name: /recarregar/i })).toBeTruthy()
  })

  it('mostra a mensagem técnica, para o relato do usuário virar diagnóstico', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorBoundary><Explode /></ErrorBoundary>)
    // Sem isto, o relato vira "ficou branco" e alguém gasta uma tarde
    // procurando. Com isto, o print já diz qual variável faltou.
    expect(screen.getByText(/Can't find variable: Check/)).toBeTruthy()
  })

  it('registra o erro no console para quem estiver com o DevTools aberto', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorBoundary><Explode /></ErrorBoundary>)
    const registrou = spy.mock.calls.some((args) =>
      args.some((a) => typeof a === 'string' && a.includes('ErrorBoundary')))
    expect(registrou).toBe(true)
  })
})
