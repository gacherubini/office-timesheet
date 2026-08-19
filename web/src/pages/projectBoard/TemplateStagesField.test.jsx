/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TemplateStagesField } from './TemplateStagesField'

afterEach(cleanup)

const CATALOGO = [
  { id: 'cat-1', name: 'Anteprojeto' },
  { id: 'cat-2', name: 'Executivo' },
]

describe('TemplateStagesField', () => {
  it('lista vazia mostra aviso de que as tasks nascem sem etapa', () => {
    render(<TemplateStagesField stages={[]} onAdd={() => {}} onRemove={() => {}} onMove={() => {}} />)
    expect(screen.getByText(/nascem sem etapa/i)).toBeTruthy()
  })

  it('marca no catálogo a etapa já adicionada e desabilita o checkbox', () => {
    render(
      <TemplateStagesField
        stages={[{ catalog_id: 'cat-1', name: 'Anteprojeto' }]}
        onAdd={() => {}}
        onRemove={() => {}}
        onMove={() => {}}
        catalogo={CATALOGO}
      />,
    )
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes[0].checked).toBe(true)
    expect(checkboxes[0].disabled).toBe(true)
    expect(checkboxes[1].checked).toBe(false)
  })

  it('clicar numa etapa do catálogo chama onAdd com catalog_id e name', () => {
    const onAdd = vi.fn()
    render(
      <TemplateStagesField stages={[]} onAdd={onAdd} onRemove={() => {}} onMove={() => {}} catalogo={CATALOGO} />,
    )
    fireEvent.click(screen.getAllByRole('checkbox')[1])
    expect(onAdd).toHaveBeenCalledWith({ catalog_id: 'cat-2', name: 'Executivo' })
  })

  it('acrescenta etapa livre com o nome digitado', () => {
    const onAdd = vi.fn()
    render(<TemplateStagesField stages={[]} onAdd={onAdd} onRemove={() => {}} onMove={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/maquete física/i), { target: { value: 'Maquete física' } })
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }))
    expect(onAdd).toHaveBeenCalledWith({ catalog_id: null, name: 'Maquete física' })
  })

  it('não acrescenta etapa livre com nome vazio', () => {
    const onAdd = vi.fn()
    render(<TemplateStagesField stages={[]} onAdd={onAdd} onRemove={() => {}} onMove={() => {}} />)
    expect(screen.getByRole('button', { name: /adicionar/i }).disabled).toBe(true)
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('remover etapa chama onRemove com o índice certo', () => {
    const onRemove = vi.fn()
    render(
      <TemplateStagesField
        stages={[{ name: 'A' }, { name: 'B' }]}
        onAdd={() => {}}
        onRemove={onRemove}
        onMove={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /remover etapa b/i }))
    expect(onRemove).toHaveBeenCalledWith(1)
  })

  it('subir/descer chama onMove com direção e desabilita nas bordas', () => {
    const onMove = vi.fn()
    render(
      <TemplateStagesField
        stages={[{ name: 'A' }, { name: 'B' }]}
        onAdd={() => {}}
        onRemove={() => {}}
        onMove={onMove}
      />,
    )
    expect(screen.getByRole('button', { name: /subir etapa a/i }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: /descer etapa b/i }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /descer etapa a/i }))
    expect(onMove).toHaveBeenCalledWith(0, 1)
  })
})
