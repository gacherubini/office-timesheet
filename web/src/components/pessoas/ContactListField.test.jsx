/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ContactListField } from './ContactListField'

afterEach(cleanup)

describe('ContactListField', () => {
  it('lista vazia mostra o botão de adicionar', () => {
    render(<ContactListField tipo="phone" itens={[]} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /adicionar telefone/i })).toBeTruthy()
  })

  it('adicionar cria uma linha com o primeiro rótulo sugerido', () => {
    const onChange = vi.fn()
    render(<ContactListField tipo="phone" itens={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /adicionar telefone/i }))
    expect(onChange).toHaveBeenCalledWith([
      { label: 'celular', value: '', is_primary: true },
    ])
  })

  it('a primeira linha nasce como principal', () => {
    const onChange = vi.fn()
    render(<ContactListField tipo="email" itens={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /adicionar e-mail/i }))
    expect(onChange.mock.calls[0][0][0].is_primary).toBe(true)
  })

  it('a segunda linha NÃO nasce principal', () => {
    const onChange = vi.fn()
    render(
      <ContactListField
        tipo="phone"
        itens={[{ label: 'celular', value: '1', is_primary: true }]}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /adicionar telefone/i }))
    expect(onChange.mock.calls[0][0][1].is_primary).toBe(false)
  })

  it('marcar um principal desmarca o outro', () => {
    const onChange = vi.fn()
    render(
      <ContactListField
        tipo="phone"
        itens={[
          { label: 'celular', value: '1', is_primary: true },
          { label: 'comercial', value: '2', is_primary: false },
        ]}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getAllByRole('radio')[1])
    const novos = onChange.mock.calls[0][0]
    expect(novos[0].is_primary).toBe(false)
    expect(novos[1].is_primary).toBe(true)
  })

  // Sem isto, o formulário mandaria zero principais e o servidor promoveria o
  // primeiro — o usuário veria o principal pular para outra linha sozinho.
  it('remover o principal promove o primeiro que sobrou', () => {
    const onChange = vi.fn()
    render(
      <ContactListField
        tipo="phone"
        itens={[
          { label: 'celular', value: '1', is_primary: true },
          { label: 'comercial', value: '2', is_primary: false },
        ]}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getAllByRole('button', { name: /remover/i })[0])
    const novos = onChange.mock.calls[0][0]
    expect(novos).toHaveLength(1)
    expect(novos[0].is_primary).toBe(true)
  })

  it('remover a última linha devolve lista vazia sem estourar', () => {
    const onChange = vi.fn()
    render(
      <ContactListField tipo="phone" itens={[{ label: 'celular', value: '1', is_primary: true }]} onChange={onChange} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /remover/i }))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('aceita rótulo personalizado', () => {
    const onChange = vi.fn()
    render(
      <ContactListField tipo="phone" itens={[{ label: 'celular', value: '1', is_primary: true }]} onChange={onChange} />,
    )
    fireEvent.change(screen.getByLabelText(/rótulo/i), { target: { value: 'portaria' } })
    expect(onChange.mock.calls[0][0][0].label).toBe('portaria')
  })
})

// "Essa bolinha à esquerda tem necessidade?", perguntou quem olhou a tela — e
// com uma linha só ela não tem: é um grupo de rádio de opção única, que nem dá
// para desmarcar, e o resultado já está garantido dos dois lados (adicionar()
// nasce principal, remover() promove quem sobrou, e normalizarContatos promove
// o primeiro se ninguém vier marcado). O marcador passa a existir exatamente
// quando passa a significar alguma coisa — que é também quando a pessoa
// descobre que ele existe.
describe('ContactListField — o marcador de principal só aparece quando há o que escolher', () => {
  const CELULAR = { label: 'celular', value: '(11) 99999-0000', is_primary: true }
  const COMERCIAL = { label: 'comercial', value: '(11) 3333-0000', is_primary: false }

  // A linha do formulário é um flex com gap; a primeira coluna é a do marcador.
  function colunaDoMarcador(indice = 0) {
    const rotulo = screen.getAllByLabelText(/rótulo do telefone/i)[indice]
    return rotulo.closest('.flex.items-center').firstElementChild
  }

  it('com uma linha só, o marcador não aparece', () => {
    render(<ContactListField tipo="phone" itens={[CELULAR]} onChange={() => {}} />)
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
  })

  it('a partir da segunda linha, todas as linhas ganham o marcador', () => {
    render(<ContactListField tipo="phone" itens={[CELULAR, COMERCIAL]} onChange={() => {}} />)
    expect(screen.getAllByRole('radio')).toHaveLength(2)
  })

  // O que sumiu foi o CONTROLE, não o campo: a linha única continua saindo
  // marcada como principal, senão a listagem ficaria sem telefone para mostrar.
  it('com o marcador escondido, o dado continua saindo como principal', () => {
    const onChange = vi.fn()
    render(<ContactListField tipo="phone" itens={[CELULAR]} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/valor do telefone/i), { target: { value: '(11) 98888-0000' } })
    expect(onChange.mock.calls[0][0][0].is_primary).toBe(true)
  })

  // Esconder o rádio tirando-o do flex encolheria a linha em uma coluna + um
  // gap, e o telefone que já estava na tela andaria para a direita no instante
  // em que o segundo fosse adicionado. A coluna fica reservada dos dois jeitos.
  it('a coluna do marcador é a mesma com uma ou com duas linhas — nada anda para o lado quando a segunda chega', () => {
    render(<ContactListField tipo="phone" itens={[CELULAR]} onChange={() => {}} />)
    const sozinha = colunaDoMarcador()
    const classesSozinha = sozinha.className
    expect(sozinha.querySelector('input[type="radio"]')).toBeNull()
    expect(classesSozinha).not.toBe('') // é coluna de verdade, com largura própria
    cleanup()

    render(<ContactListField tipo="phone" itens={[CELULAR, COMERCIAL]} onChange={() => {}} />)
    const acompanhada = colunaDoMarcador()
    expect(acompanhada.className).toBe(classesSozinha)
    expect(acompanhada.querySelector('input[type="radio"]')).not.toBeNull()
  })
})
