/** @vitest-environment jsdom */
// A reordenação do catálogo virou ARRASTAR (antes: duas setinhas por linha
// que só trocavam com o vizinho). O que estes testes protegem é o que a
// lógica pura de logic.js não alcança: o gesto (alça x linha), o teclado como
// caminho equivalente, e o comportamento OTIMISTA — com o PUT na frente do
// desenho o item volta pro lugar antigo e pula de novo quando a resposta
// chega, que é exatamente o que arrastar não pode fazer.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { StageCatalogPage } from './StageCatalogPage'

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}

vi.mock('../lib/api', () => ({
  get api() { return apiMock },
}))

const CATALOGO = [
  { id: 'a', name: 'Estudo', description: null, position: 10, is_archived: false },
  { id: 'b', name: 'Anteprojeto', description: null, position: 20, is_archived: false },
  { id: 'c', name: 'Executivo', description: null, position: 30, is_archived: false },
  { id: 'z', name: 'Maquete', description: null, position: 40, is_archived: true },
]

beforeEach(() => {
  apiMock.get.mockResolvedValue(CATALOGO.map((i) => ({ ...i })))
  apiMock.put.mockResolvedValue({})
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const alcas = () => screen.getAllByRole('button', { name: /reordenar a etapa/i })

// A ordem que a pessoa vê, lida das próprias linhas — assim o teste não
// depende de como o rótulo da alça é escrito.
function ordemNaTela() {
  return alcas().map((b) => b.closest('[draggable]').querySelector('p').textContent)
}

async function montar() {
  render(<StageCatalogPage />)
  await screen.findByText('Anteprojeto')
}

// Fake do DataTransfer (jsdom não tem — jsdom#1568). É o MESMO objeto no
// dragstart e no drop, como no arrasto real.
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

describe('StageCatalogPage — alça de arrastar', () => {
  it('toda etapa ativa ganha alça e as setinhas sumiram', async () => {
    await montar()
    expect(ordemNaTela()).toEqual(['Estudo', 'Anteprojeto', 'Executivo'])
    expect(screen.queryByRole('button', { name: /para cima/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /para baixo/i })).toBeNull()
  })

  it('etapa arquivada não reordena', async () => {
    await montar()
    expect(screen.getByText('Maquete')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /reordenar a etapa Maquete/i })).toBeNull()
  })

  it('a linha só fica arrastável depois que o mouse desce na alça', async () => {
    // Sem isso a linha inteira arrasta o tempo todo e não dá para selecionar
    // o texto nem clicar nos botões da direita.
    await montar()
    const alca = alcas()[0]
    const linha = alca.closest('[draggable]')
    expect(linha.getAttribute('draggable')).toBe('false')
    fireEvent.mouseDown(alca)
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

  it('arrastar a última etapa para o topo reordena e grava só quem mudou', async () => {
    await montar()
    arrastar(2, 0)
    await waitFor(() => expect(ordemNaTela()).toEqual(['Executivo', 'Estudo', 'Anteprojeto']))
    expect(apiMock.put.mock.calls).toEqual([
      ['/stage-catalog/c', { position: 10 }],
      ['/stage-catalog/a', { position: 20 }],
      ['/stage-catalog/b', { position: 30 }],
    ])
  })

  it('soltar na própria linha não grava nada', async () => {
    await montar()
    arrastar(1, 1)
    await waitFor(() => expect(ordemNaTela()).toEqual(['Estudo', 'Anteprojeto', 'Executivo']))
    expect(apiMock.put).not.toHaveBeenCalled()
  })
})

describe('StageCatalogPage — teclado na alça', () => {
  it('seta pra cima sobe a etapa e grava as duas que trocaram', async () => {
    await montar()
    fireEvent.keyDown(alcas()[2], { key: 'ArrowUp' })
    await waitFor(() => expect(ordemNaTela()).toEqual(['Estudo', 'Executivo', 'Anteprojeto']))
    expect(apiMock.put.mock.calls).toEqual([
      ['/stage-catalog/c', { position: 20 }],
      ['/stage-catalog/b', { position: 30 }],
    ])
  })

  it('seta pra baixo desce a etapa', async () => {
    await montar()
    fireEvent.keyDown(alcas()[0], { key: 'ArrowDown' })
    await waitFor(() => expect(ordemNaTela()).toEqual(['Anteprojeto', 'Estudo', 'Executivo']))
  })

  it('seta pra cima no primeiro item é no-op (borda da lista)', async () => {
    await montar()
    fireEvent.keyDown(alcas()[0], { key: 'ArrowUp' })
    await waitFor(() => expect(ordemNaTela()).toEqual(['Estudo', 'Anteprojeto', 'Executivo']))
    expect(apiMock.put).not.toHaveBeenCalled()
  })

  it('seta pra baixo no último item é no-op (borda da lista)', async () => {
    await montar()
    fireEvent.keyDown(alcas()[2], { key: 'ArrowDown' })
    expect(apiMock.put).not.toHaveBeenCalled()
  })

  it('outras teclas não mexem na ordem', async () => {
    await montar()
    fireEvent.keyDown(alcas()[0], { key: 'Enter' })
    expect(apiMock.put).not.toHaveBeenCalled()
  })
})

describe('StageCatalogPage — reordenação otimista', () => {
  it('a lista muda ANTES do PUT responder', async () => {
    let liberar
    apiMock.put.mockImplementation(() => new Promise((resolve) => { liberar = resolve }))
    await montar()

    fireEvent.keyDown(alcas()[2], { key: 'ArrowUp' })
    await waitFor(() => expect(ordemNaTela()).toEqual(['Estudo', 'Executivo', 'Anteprojeto']))
    expect(apiMock.put).toHaveBeenCalled()
    liberar({})
  })

  it('PUT que falha mostra o erro na faixa e recarrega do servidor', async () => {
    apiMock.put.mockRejectedValue(new Error('Sem permissão para esta ação.'))
    await montar()

    fireEvent.keyDown(alcas()[2], { key: 'ArrowUp' })
    await screen.findByText('Sem permissão para esta ação.')
    // A ordem volta a ser a do servidor: metade dos PUTs pode ter passado, e
    // só o GET sabe dizer o que ficou gravado.
    await waitFor(() => expect(ordemNaTela()).toEqual(['Estudo', 'Anteprojeto', 'Executivo']))
    expect(apiMock.get).toHaveBeenCalledTimes(2)
  })
})
