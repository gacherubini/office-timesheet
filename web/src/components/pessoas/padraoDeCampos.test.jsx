/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ContactListField } from './ContactListField'
import { AddressListField } from './AddressListField'
import { BankFields } from './BankFields'
import { PersonLinksField } from './PersonLinksField'

vi.mock('../../lib/api', () => ({ api: { get: vi.fn().mockResolvedValue([]) } }))

afterEach(cleanup)

// Os campos do cadastro de pessoa nasceram com `<input>`/`<select>` crus e
// classes escritas à mão, em vez dos componentes de components/ui. Na tela
// isso aparecia como campo de altura diferente do resto do formulário e,
// pior, como a setinha CINZA NATIVA DO CHROME no "Tipo de conta" e no seletor
// de vínculo — bem ao lado de um "Data de nascimento" desenhado no padrão do
// projeto. Duas linguagens visuais no mesmo formulário.
//
// O contrato que estes testes prendem:
//   - todo campo de texto usa `.form-control`, a classe que carrega fundo,
//     borda, placeholder e anel de foco da identidade (ver index.css);
//   - toda escolha de lista fechada usa o Select do projeto, que se anuncia
//     como `button[aria-haspopup="listbox"]` — nunca o <select> do navegador.
//
// O rótulo de telefone/e-mail/endereço é a exceção deliberada: continua sendo
// input com <datalist>, porque o PDF pede "lista pronta COM opção de digitar
// um personalizado" — e o Select não deixa digitar fora da lista.

function camposDeTexto() {
  return [...document.querySelectorAll('input:not([type=radio]):not([type=checkbox]), textarea')]
}

function gatilhosDeSelect() {
  return screen.queryAllByRole('button', { expanded: false }).filter(
    (b) => b.getAttribute('aria-haspopup') === 'listbox',
  )
}

function nativosVisiveis() {
  // O Select do projeto mantém um <select> ESCONDIDO para validação e
  // acessibilidade — esse é legítimo. O que não pode existir é um select
  // nativo que o usuário enxerga.
  return [...document.querySelectorAll('select')].filter(
    (s) => !s.className.includes('sr-only') && s.getAttribute('aria-hidden') !== 'true' && !s.hidden,
  )
}

describe('campos do cadastro de pessoa seguem o padrão do projeto', () => {
  it('telefone: rótulo e valor usam o controle padrão', () => {
    render(
      <ContactListField
        tipo="phone"
        itens={[{ label: 'celular', value: '(11) 99999-0000', is_primary: true }]}
        onChange={() => {}}
      />,
    )
    const campos = camposDeTexto()
    expect(campos.length).toBeGreaterThan(0)
    for (const c of campos) expect(c.className).toContain('form-control')
  })

  it('endereço: todos os campos usam o controle padrão', () => {
    render(
      <AddressListField
        itens={[{ label: 'residencial', cep: '', street: '', is_primary: true }]}
        onChange={() => {}}
      />,
    )
    const campos = camposDeTexto()
    expect(campos.length).toBeGreaterThanOrEqual(8) // rótulo, CEP, rua, número, compl., bairro, cidade, UF
    for (const c of campos) expect(c.className).toContain('form-control')
  })

  it('dados bancários: os quatro campos de texto usam o controle padrão', () => {
    render(<BankFields valor={{}} onChange={() => {}} />)
    const campos = camposDeTexto()
    expect(campos.length).toBe(4) // banco, agência, conta, chave PIX
    for (const c of campos) expect(c.className).toContain('form-control')
  })

  it('"Tipo de conta" é o Select do projeto, não o do navegador', () => {
    render(<BankFields valor={{}} onChange={() => {}} />)
    expect(gatilhosDeSelect()).toHaveLength(1)
    expect(nativosVisiveis()).toHaveLength(0)
  })

  it('vínculo PJ→PF: pessoa e papel são o Select do projeto', () => {
    render(
      <PersonLinksField
        entity="cliente"
        itens={[{ member_client_id: '', role: 'socio' }]}
        onChange={() => {}}
      />,
    )
    expect(gatilhosDeSelect()).toHaveLength(2)
    expect(nativosVisiveis()).toHaveLength(0)
  })
})
