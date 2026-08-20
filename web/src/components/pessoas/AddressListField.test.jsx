// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { AddressListField } from './AddressListField'

afterEach(cleanup)

const DUAS_LINHAS = [
  { label: 'residencial', cep: '', street: '', is_primary: true },
  { label: 'obra', cep: '', street: '', is_primary: false },
]

const ERRO = 'CEP não encontrado. Preencha à mão.'

function digitarCep(indice, valor) {
  fireEvent.change(screen.getAllByLabelText('CEP')[indice], { target: { value: valor } })
}

// O hook useCep é instanciado UMA vez no formulário pai (para não criar um
// AbortController por linha), então `erroCep` é um estado só, compartilhado
// pela lista inteira. Sem saber QUAL linha disparou a busca, o aviso pintava
// embaixo de todos os endereços: erra o CEP da obra, aparece aviso na
// residencial também.
describe('AddressListField — a quem o aviso de CEP pertence', () => {
  it('sem busca nenhuma, o aviso não aparece em linha alguma', async () => {
    render(<AddressListField itens={DUAS_LINHAS} onChange={() => {}} buscar={vi.fn()} erroCep={ERRO} />)
    // `erroCep` pode ter sobrado de uma tentativa anterior; até alguém digitar
    // um CEP aqui, ele não é sobre nenhuma destas linhas.
    expect(screen.queryAllByText(ERRO)).toHaveLength(0)
  })

  it('depois da busca, o aviso aparece uma vez só e descreve a linha que buscou', async () => {
    const buscar = vi.fn().mockResolvedValue({ ok: false, motivo: ERRO })
    render(<AddressListField itens={DUAS_LINHAS} onChange={() => {}} buscar={buscar} erroCep={ERRO} />)

    digitarCep(1, '99999-999')

    await waitFor(() => expect(screen.getAllByText(ERRO)).toHaveLength(1))
    const ceps = screen.getAllByLabelText('CEP')
    const aviso = screen.getByText(ERRO)
    expect(ceps[1].getAttribute('aria-describedby')).toBe(aviso.id)
    expect(ceps[0].getAttribute('aria-describedby')).toBeNull()
  })

  it('buscar noutra linha move o aviso em vez de somar mais um', async () => {
    const buscar = vi.fn().mockResolvedValue({ ok: false, motivo: ERRO })
    render(<AddressListField itens={DUAS_LINHAS} onChange={() => {}} buscar={buscar} erroCep={ERRO} />)

    digitarCep(1, '99999-999')
    await waitFor(() => expect(screen.getAllByText(ERRO)).toHaveLength(1))

    digitarCep(0, '88888-888')
    await waitFor(() => {
      const ceps = screen.getAllByLabelText('CEP')
      expect(ceps[0].getAttribute('aria-describedby')).toBe(screen.getByText(ERRO).id)
    })
    expect(screen.getAllByText(ERRO)).toHaveLength(1)
  })

  // A linha é identificada por ÍNDICE, e remover uma linha desloca todas as de
  // baixo. Sem soltar a marcação, o aviso da obra reapareceria colado noutro
  // endereço qualquer — apontando erro onde ninguém digitou nada.
  it('remover uma linha solta o aviso em vez de deixá-lo mudar de dono', async () => {
    const buscar = vi.fn().mockResolvedValue({ ok: false, motivo: ERRO })
    render(<AddressListField itens={DUAS_LINHAS} onChange={() => {}} buscar={buscar} erroCep={ERRO} />)

    digitarCep(1, '99999-999')
    await waitFor(() => expect(screen.getAllByText(ERRO)).toHaveLength(1))

    fireEvent.click(screen.getAllByRole('button', { name: /remover endereço/i })[0])

    expect(screen.queryAllByText(ERRO)).toHaveLength(0)
  })

  it('busca bem-sucedida não deixa aviso para trás', async () => {
    const buscar = vi.fn().mockResolvedValue({ ok: true, dados: { street: 'Rua Nova' } })
    render(<AddressListField itens={DUAS_LINHAS} onChange={() => {}} buscar={buscar} erroCep={null} />)

    digitarCep(1, '01001-000')

    await waitFor(() => expect(buscar).toHaveBeenCalledWith('01001-000'))
    expect(screen.queryAllByText(ERRO)).toHaveLength(0)
  })
})
