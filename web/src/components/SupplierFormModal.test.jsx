/** @vitest-environment jsdom */
// Mesmo fix do ClientFormModal.test.jsx: o GET da ficha agora devolve
// restricted_fields, e o formulário deve semeá-lo em vez do palpite
// PADRAO_RESTRITO.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { SupplierFormModal } from './SupplierFormModal'

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(() =>
      Promise.resolve({
        id: 'sup-1',
        person_type: 'pf',
        name: 'Marcenaria',
        cpf: '123.456.789-00',
        rg: '12.345.678-9',
        notes: 'observação',
        // Admin liberou o RG e restringiu as observações — o oposto do
        // palpite PADRAO_RESTRITO.
        restricted_fields: ['cpf', 'notes'],
        phones: [],
        emails: [],
        addresses: [],
        links: [],
      }),
    ),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

afterEach(cleanup)

describe('SupplierFormModal semeia os cadeados a partir de restricted_fields', () => {
  it('reflete o estado real vindo da ficha, não o palpite padrão', async () => {
    render(
      <SupplierFormModal
        open
        supplier={{ id: 'sup-1' }}
        isAdmin
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )

    const cpfInput = await screen.findByDisplayValue('123.456.789-00')
    const cpfLinha = cpfInput.closest('div').parentElement
    expect(within(cpfLinha).getByTitle('Restrito ao admin')).toBeTruthy()

    const rgInput = screen.getByDisplayValue('12.345.678-9')
    const rgLinha = rgInput.closest('div').parentElement
    expect(within(rgLinha).getByTitle('Visível para a equipe')).toBeTruthy()

    const notesInput = screen.getByDisplayValue('observação')
    const notesLinha = notesInput.closest('div').parentElement
    expect(within(notesLinha).getByTitle('Restrito ao admin')).toBeTruthy()
  })
})
