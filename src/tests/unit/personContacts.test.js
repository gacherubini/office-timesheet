import { describe, it, expect } from 'vitest'
import { normalizarContatos, LABELS_SUGERIDOS } from '../../lib/personContacts.js'

describe('normalizarContatos', () => {
  it('lista vazia é válida e devolve vazio', () => {
    expect(normalizarContatos([], { tipo: 'phone' })).toEqual({ itens: [] })
    expect(normalizarContatos(undefined, { tipo: 'phone' })).toEqual({ itens: [] })
  })

  it('promove o primeiro quando ninguém marca principal', () => {
    const { itens } = normalizarContatos(
      [{ label: 'celular', value: '1' }, { label: 'comercial', value: '2' }],
      { tipo: 'phone' },
    )
    expect(itens[0].is_primary).toBe(true)
    expect(itens[1].is_primary).toBe(false)
  })

  it('respeita o principal marcado', () => {
    const { itens } = normalizarContatos(
      [{ label: 'celular', value: '1' }, { label: 'comercial', value: '2', is_primary: true }],
      { tipo: 'phone' },
    )
    expect(itens[0].is_primary).toBe(false)
    expect(itens[1].is_primary).toBe(true)
  })

  // Mensagem legível em vez de deixar o índice parcial do banco estourar com
  // "duplicate key value violates unique constraint person_phones_principal_..."
  it('recusa dois principais com erro em português', () => {
    const r = normalizarContatos(
      [{ label: 'celular', value: '1', is_primary: true },
       { label: 'comercial', value: '2', is_primary: true }],
      { tipo: 'phone' },
    )
    expect(r.error).toMatch(/apenas um telefone/i)
  })

  it('recusa item sem rótulo', () => {
    const r = normalizarContatos([{ label: '  ', value: '1' }], { tipo: 'phone' })
    expect(r.error).toMatch(/rótulo/i)
  })

  it('recusa item sem valor', () => {
    const r = normalizarContatos([{ label: 'celular', value: '' }], { tipo: 'phone' })
    expect(r.error).toMatch(/vazio/i)
  })

  it('apara espaços de rótulo e valor', () => {
    const { itens } = normalizarContatos([{ label: '  celular ', value: ' 11999 ' }], { tipo: 'phone' })
    expect(itens[0].label).toBe('celular')
    expect(itens[0].value).toBe('11999')
  })

  it('numera a posição pela ordem recebida', () => {
    const { itens } = normalizarContatos(
      [{ label: 'a', value: '1' }, { label: 'b', value: '2' }, { label: 'c', value: '3' }],
      { tipo: 'phone' },
    )
    expect(itens.map((i) => i.position)).toEqual([0, 1, 2])
  })

  it('endereço valida rótulo mas aceita campos vazios', () => {
    const { itens } = normalizarContatos(
      [{ label: 'obra', cep: '01310-100', street: 'Av. Paulista' }],
      { tipo: 'address' },
    )
    expect(itens[0].label).toBe('obra')
    expect(itens[0].cep).toBe('01310-100')
    expect(itens[0].number).toBeNull()
  })

  it('endereço sem nenhum campo preenchido é recusado', () => {
    const r = normalizarContatos([{ label: 'obra' }], { tipo: 'address' })
    expect(r.error).toMatch(/vazio/i)
  })

  it('a mensagem cita o tipo certo', () => {
    const dois = [{ label: 'a', value: '1', is_primary: true }, { label: 'b', value: '2', is_primary: true }]
    expect(normalizarContatos(dois, { tipo: 'email' }).error).toMatch(/apenas um e-mail/i)
    const doisEnd = [{ label: 'a', city: 'SP', is_primary: true }, { label: 'b', city: 'RJ', is_primary: true }]
    expect(normalizarContatos(doisEnd, { tipo: 'address' }).error).toMatch(/apenas um endereço/i)
  })

  it('expõe os rótulos sugeridos do PDF', () => {
    expect(LABELS_SUGERIDOS.phone).toContain('celular')
    expect(LABELS_SUGERIDOS.phone).toContain('WhatsApp')
    expect(LABELS_SUGERIDOS.email).toContain('financeiro / nota fiscal')
    expect(LABELS_SUGERIDOS.address).toContain('obra')
  })
})
