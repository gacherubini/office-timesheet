/** @vitest-environment jsdom */
// O GET da ficha agora devolve restricted_fields (fix do buraco de
// visibilidade — ver docs/pendencias-go-live). O formulário deve semear os
// cadeados a partir dele, não mais do palpite PADRAO_RESTRITO.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { ClientFormModal } from './ClientFormModal'

// ClientAttachments (renderizado dentro do modal em modo edição) usa
// useAuth — fora de foco deste teste, então evitamos montar o AuthProvider
// de verdade.
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { role: 'admin' }, isAdmin: true }),
}))

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn((url) => {
      if (url.endsWith('/attachments')) return Promise.resolve([])
      return Promise.resolve({
        id: 'cli-1',
        person_type: 'pf',
        name: 'Fulano',
        cpf: '123.456.789-00',
        rg: '12.345.678-9',
        notes: 'observação',
        // Admin liberou o RG e restringiu as observações — o oposto do
        // palpite PADRAO_RESTRITO (que restringiria cpf/rg e liberaria notes).
        restricted_fields: ['cpf', 'notes'],
        phones: [],
        emails: [],
        addresses: [],
        links: [],
      })
    }),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

afterEach(cleanup)

describe('ClientFormModal semeia os cadeados a partir de restricted_fields', () => {
  it('reflete o estado real vindo da ficha, não o palpite padrão', async () => {
    render(
      <ClientFormModal
        open
        client={{ id: 'cli-1' }}
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
    // Palpite padrão marcaria RG como restrito; a ficha real diz que não.
    expect(within(rgLinha).getByTitle('Visível para a equipe')).toBeTruthy()

    const notesInput = screen.getByDisplayValue('observação')
    const notesLinha = notesInput.closest('div').parentElement
    // Palpite padrão liberaria notes; a ficha real diz que está restrito.
    expect(within(notesLinha).getByTitle('Restrito ao admin')).toBeTruthy()
  })
})
