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

// Mesma decisão do ContactListField, e pelo mesmo motivo: com um endereço só,
// o marcador de principal é um rádio de opção única — não dá para desmarcar e
// o resultado já é garantido por adicionar()/remover() aqui e por
// normalizarContatos no servidor. Ele aparece a partir do segundo, que é
// quando escolher passa a ser uma escolha.
describe('AddressListField — o marcador de principal só aparece quando há o que escolher', () => {
  const UM_ENDERECO = [{ label: 'residencial', cep: '', street: '', is_primary: true }]

  // O cabeçalho da linha é um flex com gap; a primeira coluna é a do marcador.
  function colunaDoMarcador(indice = 0) {
    const rotulo = screen.getAllByLabelText(/rótulo do endereço/i)[indice]
    return rotulo.closest('.flex.items-center').firstElementChild
  }

  it('com um endereço só, o marcador não aparece', () => {
    render(<AddressListField itens={UM_ENDERECO} onChange={() => {}} />)
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
  })

  it('a partir do segundo endereço, todos ganham o marcador', () => {
    render(<AddressListField itens={DUAS_LINHAS} onChange={() => {}} />)
    expect(screen.getAllByRole('radio')).toHaveLength(2)
  })

  // Escondemos o CONTROLE, não o campo: o endereço único continua saindo como
  // principal — é ele que a listagem mostra.
  it('com o marcador escondido, o dado continua saindo como principal', () => {
    const onChange = vi.fn()
    render(<AddressListField itens={UM_ENDERECO} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Rua'), { target: { value: 'Rua Nova' } })
    expect(onChange.mock.calls[0][0][0].is_primary).toBe(true)
  })

  // Tirar o rádio do flex encolheria o cabeçalho em uma coluna + um gap, e o
  // rótulo do endereço que já estava na tela andaria para a direita assim que o
  // segundo endereço fosse adicionado.
  it('a coluna do marcador é a mesma com um ou com dois endereços — nada anda para o lado quando o segundo chega', () => {
    render(<AddressListField itens={UM_ENDERECO} onChange={() => {}} />)
    const sozinha = colunaDoMarcador()
    const classesSozinha = sozinha.className
    expect(sozinha.querySelector('input[type="radio"]')).toBeNull()
    expect(classesSozinha).not.toBe('') // é coluna de verdade, com largura própria
    cleanup()

    render(<AddressListField itens={DUAS_LINHAS} onChange={() => {}} />)
    const acompanhada = colunaDoMarcador()
    expect(acompanhada.className).toBe(classesSozinha)
    expect(acompanhada.querySelector('input[type="radio"]')).not.toBeNull()
  })
})
