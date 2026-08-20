/** @vitest-environment jsdom */
// O modal listava o CATÁLOGO na ordem do catálogo, com os extras presos no
// fim, e tinha uma coluna numérica "Ordem" que gravava
// project_stages.position — número que só a trilha do topo do projeto usava.
// Ou seja: mexer na ordem ali não movia nada ali. Agora a lista tem dois
// grupos (as etapas DESTE projeto, na ordem do projeto e arrastáveis; e as
// não ativadas, na ordem do catálogo, sem alça), e a coluna sumiu.
//
// Estes testes protegem exatamente as decisões desse desenho — porque nenhuma
// delas é óbvia lendo o componente depois.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { StageManagerModal } from './StageManagerModal'

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}

vi.mock('../../lib/api', () => ({
  get api() { return apiMock },
}))

const CATALOGO = [
  { id: 'c1', name: 'Estudo', description: null, position: 10 },
  { id: 'c2', name: 'Anteprojeto', description: null, position: 20 },
  { id: 'c3', name: 'Executivo', description: null, position: 30 },
]

// O projeto ativou Estudo e Executivo e criou uma etapa extra NO MEIO
// (position 20). Se a lista voltar a fixar extra no fim, este fixture pega.
const STAGES = [
  { id: 's1', catalog_id: 'c1', name: 'Estudo', position: 10, status: 'nao_iniciada', due_date: null, owner_id: null },
  { id: 's2', catalog_id: null, name: 'Maquete física', position: 20, status: 'nao_iniciada', due_date: null, owner_id: null },
  { id: 's3', catalog_id: 'c3', name: 'Executivo', position: 30, status: 'nao_iniciada', due_date: null, owner_id: null },
]

beforeEach(() => {
  apiMock.get.mockResolvedValue(CATALOGO.map((i) => ({ ...i })))
  apiMock.put.mockResolvedValue({})
  apiMock.post.mockResolvedValue({})
  apiMock.delete.mockResolvedValue({})
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const alcas = () => screen.getAllByRole('button', { name: /reordenar a etapa/i })

// Ordem do grupo de cima (só ele tem alça).
const ordemDoProjeto = () => alcas().map((b) => (
  b.getAttribute('aria-label').replace('Arrastar para reordenar a etapa ', '')
))

// Ordem da lista INTEIRA: todo item dos dois grupos tem um checkbox.
const ordemNaTela = () => screen.getAllByRole('checkbox').map((c) => (
  c.getAttribute('aria-label').replace(/^(Ativar|Desativar) a etapa /, '')
))

async function montar({ stages = STAGES, onChanged = vi.fn() } = {}) {
  const utils = render(
    <StageManagerModal projectId="p1" stages={stages} users={[]} onClose={() => {}} onChanged={onChanged} />,
  )
  await screen.findByText('Anteprojeto')
  return { ...utils, onChanged }
}

// Pai de mentira: guarda `stages` como estado e, a cada onChanged(), devolve
// a lista do SERVIDOR (identidade nova). É como ProjectPage vive — o modal não
// tem cópia própria da lista, só espelha a prop.
function PaiQueRecarrega({ stagesDoServidor }) {
  const [stages, setStages] = useState(stagesDoServidor)
  return (
    <StageManagerModal
      projectId="p1"
      stages={stages}
      users={[]}
      onClose={() => {}}
      onChanged={() => setStages(stagesDoServidor.map((s) => ({ ...s })))}
    />
  )
}

function transferencia() {
  const dados = {}
  return {
    effectAllowed: '',
    setData: (tipo, valor) => { dados[tipo] = String(valor) },
    getData: (tipo) => dados[tipo] || '',
  }
}

function arrastar(deIndice, paraIndice) {
  const dataTransfer = transferencia()
  const origem = alcas()[deIndice].closest('[draggable]')
  const destino = alcas()[paraIndice].closest('[draggable]')
  fireEvent.mouseDown(alcas()[deIndice])
  fireEvent.dragStart(origem, { dataTransfer })
  fireEvent.dragOver(destino, { dataTransfer })
  fireEvent.drop(destino, { dataTransfer })
}

describe('StageManagerModal — os dois grupos', () => {
  it('as etapas do projeto vêm no topo, na ordem do projeto, com o extra intercalado', async () => {
    await montar()
    expect(ordemDoProjeto()).toEqual(['Estudo', 'Maquete física', 'Executivo'])
  })

  it('as não ativadas ficam embaixo, sob subtítulo, e não reordenam', async () => {
    await montar()
    expect(screen.getByText(/não ativadas neste projeto/i)).toBeTruthy()
    expect(ordemNaTela()).toEqual(['Estudo', 'Maquete física', 'Executivo', 'Anteprojeto'])
    expect(screen.queryByRole('button', { name: /reordenar a etapa Anteprojeto/i })).toBeNull()
  })

  it('a coluna numérica "Ordem" não existe mais', async () => {
    await montar()
    expect(screen.queryByLabelText(/^Ordem da etapa/i)).toBeNull()
    expect(screen.queryByText('Ordem')).toBeNull()
  })

  it('etapa do projeto cujo item do catálogo foi arquivado continua na lista', async () => {
    // GET /stage-catalog não devolve arquivadas. Como a lista de cima agora
    // sai de `stages`, e não do catálogo, a etapa não some mais da tela.
    const comArquivada = [
      ...STAGES,
      { id: 's9', catalog_id: 'c99', name: 'Legado', position: 40, status: 'nao_iniciada', due_date: null, owner_id: null },
    ]
    await montar({ stages: comArquivada })
    expect(ordemDoProjeto()).toEqual(['Estudo', 'Maquete física', 'Executivo', 'Legado'])
  })

  it('marcar uma não ativada ativa pelo catálogo', async () => {
    await montar()
    fireEvent.click(screen.getByRole('checkbox', { name: /ativar a etapa Anteprojeto/i }))
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/projects/p1/stages', { catalog_id: 'c2' }))
  })

  it('desmarcar uma do projeto remove a etapa', async () => {
    await montar()
    fireEvent.click(screen.getByRole('checkbox', { name: /desativar a etapa Estudo/i }))
    await waitFor(() => expect(apiMock.delete).toHaveBeenCalledWith('/projects/p1/stages/s1'))
  })
})

describe('StageManagerModal — arrastar e teclado', () => {
  it('a linha só fica arrastável depois que o mouse desce na alça', async () => {
    await montar()
    const linha = alcas()[0].closest('[draggable]')
    expect(linha.getAttribute('draggable')).toBe('false')
    fireEvent.mouseDown(alcas()[0])
    expect(linha.getAttribute('draggable')).toBe('true')
    fireEvent.dragEnd(linha)
    expect(linha.getAttribute('draggable')).toBe('false')
  })

  it('o alvo do arrasto ganha marca visual e a perde ao sair', async () => {
    await montar()
    const dataTransfer = transferencia()
    const origem = alcas()[2].closest('[draggable]')
    const destino = alcas()[0].closest('[draggable]')
    fireEvent.mouseDown(alcas()[2])
    fireEvent.dragStart(origem, { dataTransfer })
    fireEvent.dragOver(destino, { dataTransfer })
    expect(destino.className).toMatch(/accent/)
    fireEvent.dragLeave(destino)
    expect(destino.className).not.toMatch(/accent/)
  })

  it('arrastar a última para o topo grava position em project_stages', async () => {
    const { onChanged } = await montar()
    arrastar(2, 0)
    await waitFor(() => expect(ordemDoProjeto()).toEqual(['Executivo', 'Estudo', 'Maquete física']))
    expect(apiMock.put.mock.calls).toEqual([
      ['/projects/p1/stages/s3', { position: 10 }],
      ['/projects/p1/stages/s1', { position: 20 }],
      ['/projects/p1/stages/s2', { position: 30 }],
    ])
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('soltar na própria linha não grava nada', async () => {
    await montar()
    arrastar(1, 1)
    expect(apiMock.put).not.toHaveBeenCalled()
  })

  it('seta pra cima sobe a etapa e grava só quem mudou', async () => {
    await montar()
    fireEvent.keyDown(alcas()[2], { key: 'ArrowUp' })
    await waitFor(() => expect(ordemDoProjeto()).toEqual(['Estudo', 'Executivo', 'Maquete física']))
    expect(apiMock.put.mock.calls).toEqual([
      ['/projects/p1/stages/s3', { position: 20 }],
      ['/projects/p1/stages/s2', { position: 30 }],
    ])
  })

  it('seta pra baixo desce a etapa', async () => {
    await montar()
    fireEvent.keyDown(alcas()[0], { key: 'ArrowDown' })
    await waitFor(() => expect(ordemDoProjeto()).toEqual(['Maquete física', 'Estudo', 'Executivo']))
  })

  it('bordas da lista são no-op', async () => {
    await montar()
    fireEvent.keyDown(alcas()[0], { key: 'ArrowUp' })
    fireEvent.keyDown(alcas()[2], { key: 'ArrowDown' })
    fireEvent.keyDown(alcas()[0], { key: 'Enter' })
    expect(apiMock.put).not.toHaveBeenCalled()
  })
})

describe('StageManagerModal — reordenação otimista', () => {
  it('a lista muda ANTES do PUT responder', async () => {
    let liberar
    apiMock.put.mockImplementation(() => new Promise((resolve) => { liberar = resolve }))
    await montar()

    fireEvent.keyDown(alcas()[2], { key: 'ArrowUp' })
    await waitFor(() => expect(ordemDoProjeto()).toEqual(['Estudo', 'Executivo', 'Maquete física']))
    expect(apiMock.put).toHaveBeenCalled()
    liberar({})
  })

  it('PUT que falha mostra o erro e a ordem volta a ser a do servidor', async () => {
    apiMock.put.mockRejectedValue(new Error('Sem permissão para esta ação.'))
    render(<PaiQueRecarrega stagesDoServidor={STAGES} />)
    await screen.findByText('Anteprojeto')

    fireEvent.keyDown(alcas()[2], { key: 'ArrowUp' })
    await screen.findByText('Sem permissão para esta ação.')
    await waitFor(() => expect(ordemDoProjeto()).toEqual(['Estudo', 'Maquete física', 'Executivo']))
  })
})
