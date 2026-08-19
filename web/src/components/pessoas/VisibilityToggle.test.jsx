/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { VisibilityToggle } from './VisibilityToggle'

afterEach(cleanup)

describe('VisibilityToggle', () => {
  // A regra que mais importa (task-7-brief.md): quem não pode mudar a
  // visibilidade NÃO VÊ o controle. Um cadeado desabilitado já denunciaria
  // que existe algo escondido ali.
  it('não renderiza nada quando não pode editar', () => {
    const { container } = render(
      <VisibilityToggle restrito={false} onChange={() => {}} podeEditar={false} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('não renderiza nada quando não pode editar, mesmo restrito', () => {
    const { container } = render(
      <VisibilityToggle restrito onChange={() => {}} podeEditar={false} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('quando pode editar e o campo está restrito, mostra o estado restrito', () => {
    render(<VisibilityToggle restrito onChange={() => {}} podeEditar />)
    const botao = screen.getByRole('button')
    expect(botao.title).toBe('Restrito ao admin')
    expect(botao.getAttribute('aria-label')).toMatch(/restrito ao admin/i)
  })

  it('quando pode editar e o campo está visível, mostra o estado visível', () => {
    render(<VisibilityToggle restrito={false} onChange={() => {}} podeEditar />)
    const botao = screen.getByRole('button')
    expect(botao.title).toBe('Visível para a equipe')
    expect(botao.getAttribute('aria-label')).toMatch(/visível para a equipe/i)
  })

  it('clicar alterna chamando onChange com o valor invertido (visível -> restrito)', () => {
    const onChange = vi.fn()
    render(<VisibilityToggle restrito={false} onChange={onChange} podeEditar />)
    fireEvent.click(screen.getByRole('button'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('clicar alterna chamando onChange com o valor invertido (restrito -> visível)', () => {
    const onChange = vi.fn()
    render(<VisibilityToggle restrito onChange={onChange} podeEditar />)
    fireEvent.click(screen.getByRole('button'))
    expect(onChange).toHaveBeenCalledWith(false)
  })
})
