/** @vitest-environment jsdom */
// Cobre a ligação entre a tela e a API que a suíte de templateStagesLogic.js
// não alcança: mapear template_stage_id -> stageIndex ao abrir (startEdit) e
// devolver stage_index correto ao salvar (save) — inclusive o caso de
// template ANTIGO (migration 050: sem etapas, items com template_stage_id
// nulo), que precisa continuar abrindo e salvando sem quebrar.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { TemplateManager } from './TemplateManager'

const apiMock = {
  get: vi.fn(),
  post: vi.fn(() => Promise.resolve({ id: 'novo' })),
  put: vi.fn(() => Promise.resolve({ id: 't1' })),
  delete: vi.fn(),
}

vi.mock('../../lib/api', () => ({
  get api() { return apiMock },
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// GET /stage-catalog é chamado toda vez que o editor abre — vazio é
// suficiente pros testes abaixo (não usam o catálogo).
function mockCatalogoVazio() {
  apiMock.get.mockImplementation((url) => {
    if (url === '/stage-catalog') return Promise.resolve([])
    return Promise.resolve({})
  })
}

describe('TemplateManager: mapeamento etapa <-> stage_index', () => {
  it('template ANTIGO (sem etapas) abre e salva com stages:[] e stage_index null', async () => {
    apiMock.get.mockImplementation((url) => {
      if (url === '/stage-catalog') return Promise.resolve([])
      if (url === '/project-templates/t1') {
        return Promise.resolve({
          id: 't1',
          name: 'Antigo',
          description: null,
          stages: [],
          items: [{ id: 'i1', title: 'Tarefa solta', description: null, priority: 'medium', template_stage_id: null }],
        })
      }
      return Promise.resolve({})
    })

    render(
      <TemplateManager
        templates={[{ id: 't1', name: 'Antigo', item_count: 1 }]}
        onBack={() => {}}
        onChanged={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /editar/i }))
    await screen.findByDisplayValue('Antigo')
    await screen.findByDisplayValue('Tarefa solta')

    fireEvent.click(screen.getByRole('button', { name: /salvar template/i }))

    await waitFor(() => expect(apiMock.put).toHaveBeenCalled())
    const [, payload] = apiMock.put.mock.calls[0]
    expect(payload.stages).toEqual([])
    expect(payload.items).toEqual([
      { title: 'Tarefa solta', description: null, priority: 'medium', stage_index: null },
    ])
  })

  it('template com etapas mapeia template_stage_id pro índice certo e preserva no save', async () => {
    apiMock.get.mockImplementation((url) => {
      if (url === '/stage-catalog') return Promise.resolve([])
      if (url === '/project-templates/t2') {
        return Promise.resolve({
          id: 't2',
          name: 'Residencial',
          description: null,
          stages: [
            { id: 's1', catalog_id: null, name: 'Anteprojeto', position: 0 },
            { id: 's2', catalog_id: null, name: 'Executivo', position: 1 },
          ],
          items: [
            { id: 'i1', title: 'Planta', description: null, priority: 'medium', template_stage_id: 's2' },
            { id: 'i2', title: 'Solta', description: null, priority: 'low', template_stage_id: null },
          ],
        })
      }
      return Promise.resolve({})
    })

    render(
      <TemplateManager
        templates={[{ id: 't2', name: 'Residencial', item_count: 2 }]}
        onBack={() => {}}
        onChanged={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /editar/i }))
    await screen.findByDisplayValue('Residencial')

    fireEvent.click(screen.getByRole('button', { name: /salvar template/i }))

    await waitFor(() => expect(apiMock.put).toHaveBeenCalled())
    const [, payload] = apiMock.put.mock.calls[0]
    expect(payload.stages).toEqual([
      { catalog_id: null, name: 'Anteprojeto' },
      { catalog_id: null, name: 'Executivo' },
    ])
    // 'Planta' pertencia à etapa 's2' = índice 1 (Executivo); 'Solta' segue sem etapa.
    expect(payload.items).toEqual([
      { title: 'Planta', description: null, priority: 'medium', stage_index: 1 },
      { title: 'Solta', description: null, priority: 'low', stage_index: null },
    ])
  })

  it('template novo manda stages:[] no POST mesmo sem nenhuma etapa criada', async () => {
    mockCatalogoVazio()
    const { container } = render(<TemplateManager templates={[]} onBack={() => {}} onChanged={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /novo template/i }))
    // Nome é o único <input> nesse momento (Descrição é textarea; não há
    // items ainda) — sem htmlFor no componente Input, é o jeito estável de
    // achar o campo certo.
    fireEvent.change(container.querySelector('input'), { target: { value: 'Recém-criado' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar template/i }))

    await waitFor(() => expect(apiMock.post).toHaveBeenCalled())
    const [, payload] = apiMock.post.mock.calls[0]
    expect(payload.stages).toEqual([])
    expect(payload.items).toEqual([])
  })
})
