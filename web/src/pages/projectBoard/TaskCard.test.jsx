/** @vitest-environment jsdom */
// Item 3 do brief de 19/08/2026: o card não mostrava a etapa da tarefa. Com
// o quadro em "Todas as etapas" (o padrão), não dava pra saber a que etapa
// cada tarefa pertence. `showStage` deixa o pai (KanbanBoard/ProjectPage)
// silenciar o rótulo quando o quadro já está filtrado por uma etapa — aí ele
// vira ruído redundante em todo card.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TaskCard } from './TaskCard'

const TASK_BASE = {
  id: 't1', title: 'Planta baixa', status: 'todo', priority: 'medium',
  project_name: 'Casa 1', stage_id: 's1', stage_name: 'Anteprojeto',
}

afterEach(cleanup)

describe('TaskCard — etapa', () => {
  it('mostra o nome da etapa por padrão', () => {
    render(<TaskCard task={TASK_BASE} onClick={() => {}} onDragStart={() => {}} />)
    expect(screen.getByText('Anteprojeto')).toBeTruthy()
  })

  it('esconde a etapa quando showStage=false (quadro já filtrado por ela)', () => {
    render(<TaskCard task={TASK_BASE} onClick={() => {}} onDragStart={() => {}} showStage={false} />)
    expect(screen.queryByText('Anteprojeto')).toBeNull()
  })

  it('não quebra quando a tarefa não tem stage_name', () => {
    const semEtapa = { ...TASK_BASE, stage_name: null }
    render(<TaskCard task={semEtapa} onClick={() => {}} onDragStart={() => {}} />)
    expect(screen.queryByText('Anteprojeto')).toBeNull()
  })
})
