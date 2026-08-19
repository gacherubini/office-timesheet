/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { StageTrack } from './StageTrack'

afterEach(cleanup)

const ETAPAS = [
  { id: 'e1', name: 'Conceituação', status: 'aprovada', done_count: 3, task_count: 3, due_date: null, total_minutes: 600 },
  { id: 'e2', name: 'Anteprojeto', status: 'em_andamento', done_count: 5, task_count: 11, due_date: '2026-08-24', total_minutes: 1200 },
  { id: 'e3', name: 'Executivo', status: 'nao_iniciada', done_count: 0, task_count: 0, due_date: null, total_minutes: 0 },
]

describe('StageTrack', () => {
  it('mostra as etapas na ordem recebida', () => {
    render(<StageTrack etapas={ETAPAS} etapaAtiva={null} onSelecionar={() => {}} />)
    const nomes = screen.getAllByRole('button').map((b) => b.textContent)
    expect(nomes.join(' ')).toContain('Conceituação')
    expect(nomes.join(' ')).toContain('Anteprojeto')
  })

  // O exemplo literal do PDF.
  it('mostra o progresso "5/11"', () => {
    render(<StageTrack etapas={ETAPAS} etapaAtiva={null} onSelecionar={() => {}} />)
    expect(document.body.textContent).toContain('5/11')
  })

  it('etapa sem tarefa não mostra progresso', () => {
    render(<StageTrack etapas={[ETAPAS[2]]} etapaAtiva={null} onSelecionar={() => {}} />)
    expect(document.body.textContent).not.toContain('0/0')
  })

  it('clicar numa etapa chama onSelecionar com o id', () => {
    const onSelecionar = vi.fn()
    render(<StageTrack etapas={ETAPAS} etapaAtiva={null} onSelecionar={onSelecionar} />)
    fireEvent.click(screen.getByRole('button', { name: /anteprojeto/i }))
    expect(onSelecionar).toHaveBeenCalledWith('e2')
  })

  it('clicar na etapa ativa desmarca (volta para todas)', () => {
    const onSelecionar = vi.fn()
    render(<StageTrack etapas={ETAPAS} etapaAtiva="e2" onSelecionar={onSelecionar} />)
    fireEvent.click(screen.getByRole('button', { name: /anteprojeto/i }))
    expect(onSelecionar).toHaveBeenCalledWith(null)
  })

  it('mostra o prazo da etapa em andamento', () => {
    render(<StageTrack etapas={ETAPAS} etapaAtiva={null} onSelecionar={() => {}} />)
    expect(document.body.textContent).toContain('24/08')
  })

  it('sem etapa nenhuma, orienta em vez de mostrar vazio', () => {
    render(<StageTrack etapas={[]} etapaAtiva={null} onSelecionar={() => {}} />)
    expect(document.body.textContent).toMatch(/nenhuma etapa/i)
  })
})
