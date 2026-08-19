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
