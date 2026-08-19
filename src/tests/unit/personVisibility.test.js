import { describe, it, expect } from 'vitest'
import {
  aplicarVisibilidade, aplicarVisibilidadeEmLista, filtrarLinhasRestritas,
  CAMPOS_RESTRINGIVEIS, PADRAO_RESTRITO,
} from '../../lib/personVisibility.js'

const admin = { id: 'a1', role: 'admin' }
const emp = { id: 'e1', role: 'employee' }
const pessoa = { id: 'c1', name: 'Fulano', cpf: '123', rg: '456', notes: 'obs', pix_key: 'x@y.z' }

describe('aplicarVisibilidade', () => {
  it('admin recebe tudo, intacto', () => {
    expect(aplicarVisibilidade(admin, pessoa, ['cpf', 'rg'])).toEqual(pessoa)
  })

  // O ponto do item 6: "nem mascarado, nem com aviso".
  it('colaborador não recebe a CHAVE do campo restrito', () => {
    const r = aplicarVisibilidade(emp, pessoa, ['cpf'])
    expect('cpf' in r).toBe(false)
    expect(r.cpf).toBeUndefined()
  })

  it('o campo restrito não vira null', () => {
    const r = aplicarVisibilidade(emp, pessoa, ['cpf'])
    expect(Object.keys(r)).not.toContain('cpf')
  })

  it('os campos não restritos continuam', () => {
    const r = aplicarVisibilidade(emp, pessoa, ['cpf'])
    expect(r.name).toBe('Fulano')
    expect(r.rg).toBe('456')
  })

  it('remove vários de uma vez', () => {
    const r = aplicarVisibilidade(emp, pessoa, ['cpf', 'rg', 'pix_key'])
    expect(Object.keys(r).sort()).toEqual(['id', 'name', 'notes'])
  })

  it('lista de restritos vazia devolve tudo', () => {
    expect(aplicarVisibilidade(emp, pessoa, [])).toEqual(pessoa)
    expect(aplicarVisibilidade(emp, pessoa, undefined)).toEqual(pessoa)
  })

  // Defesa em profundidade: se alguém inserir 'name' na tabela por engano ou
  // por má-fé, os cards de projeto não podem sumir do sistema inteiro.
  it('ignora campo fora da allowlist', () => {
    const r = aplicarVisibilidade(emp, pessoa, ['name'])
    expect(r.name).toBe('Fulano')
  })

  it('não muta o objeto recebido', () => {
    const orig = { ...pessoa }
    aplicarVisibilidade(emp, pessoa, ['cpf'])
    expect(pessoa).toEqual(orig)
  })

  it('pessoa nula não estoura', () => {
    expect(aplicarVisibilidade(emp, null, ['cpf'])).toBeNull()
  })

  it('perfil ausente é tratado como não-admin', () => {
    const r = aplicarVisibilidade(null, pessoa, ['cpf'])
    expect('cpf' in r).toBe(false)
  })
})

describe('aplicarVisibilidadeEmLista', () => {
  it('aplica os restritos de cada pessoa, não os do vizinho', () => {
    const lista = [{ id: 'c1', name: 'A', cpf: '1' }, { id: 'c2', name: 'B', cpf: '2' }]
    const r = aplicarVisibilidadeEmLista(emp, lista, { c1: ['cpf'] })
    expect('cpf' in r[0]).toBe(false)
    expect(r[1].cpf).toBe('2')
  })

  it('admin recebe a lista inteira', () => {
    const lista = [{ id: 'c1', name: 'A', cpf: '1' }]
    expect(aplicarVisibilidadeEmLista(admin, lista, { c1: ['cpf'] })[0].cpf).toBe('1')
  })

  it('lista vazia devolve vazio', () => {
    expect(aplicarVisibilidadeEmLista(emp, [], {})).toEqual([])
    expect(aplicarVisibilidadeEmLista(emp, null, {})).toEqual([])
  })
})

describe('filtrarLinhasRestritas', () => {
  const linhas = [
    { id: 'p1', label: 'celular', value: '1', is_primary: true, is_restricted: false },
    { id: 'p2', label: 'recado', value: '2', is_primary: false, is_restricted: true },
  ]

  it('admin vê as duas', () => {
    expect(filtrarLinhasRestritas(admin, linhas)).toHaveLength(2)
  })

  it('colaborador vê só a liberada', () => {
    const r = filtrarLinhasRestritas(emp, linhas)
    expect(r).toHaveLength(1)
    expect(r[0].label).toBe('celular')
  })

  // Se o principal era o restrito, o colaborador não pode ficar com lista vazia
  // tendo telefone disponível: o próximo assume o papel na visão dele.
  it('se o principal era restrito, o próximo vira principal para quem não vê', () => {
    const comPrincipalRestrito = [
      { id: 'p1', label: 'pessoal', value: '1', is_primary: true, is_restricted: true },
      { id: 'p2', label: 'comercial', value: '2', is_primary: false, is_restricted: false },
    ]
    const r = filtrarLinhasRestritas(emp, comPrincipalRestrito)
    expect(r).toHaveLength(1)
    expect(r[0].is_primary).toBe(true)
  })

  it('todas restritas devolve lista vazia', () => {
    const todas = linhas.map((l) => ({ ...l, is_restricted: true }))
    expect(filtrarLinhasRestritas(emp, todas)).toEqual([])
  })

  it('lista nula devolve vazio', () => {
    expect(filtrarLinhasRestritas(emp, null)).toEqual([])
  })
})

describe('allowlist e padrões', () => {
  it('cobre os campos que o PDF manda nascer restritos', () => {
    for (const c of ['cpf', 'cnpj', 'rg', 'bank_name', 'bank_agency', 'bank_account', 'pix_key']) {
      expect(CAMPOS_RESTRINGIVEIS.has(c)).toBe(true)
    }
  })

  it('name NÃO é restringível', () => {
    expect(CAMPOS_RESTRINGIVEIS.has('name')).toBe(false)
  })

  it('o padrão do PDF: CPF, CNPJ, RG e bancários', () => {
    expect(PADRAO_RESTRITO).toEqual(expect.arrayContaining(['cpf', 'cnpj', 'rg', 'pix_key']))
    expect(PADRAO_RESTRITO).not.toContain('notes')
  })

  it('todo padrão está na allowlist', () => {
    for (const c of PADRAO_RESTRITO) expect(CAMPOS_RESTRINGIVEIS.has(c)).toBe(true)
  })
})
