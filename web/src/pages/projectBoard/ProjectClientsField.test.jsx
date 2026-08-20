/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { ProjectClientsField } from './ProjectClientsField'

vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue([
      { id: 'c1', name: 'Construtora Aurora' },
      { id: 'c2', name: 'Marcos Aurélio' },
    ]),
  },
}))

afterEach(cleanup)

const UM_CONTRATANTE = [{ client_id: 'c1', role: 'contratante_principal', is_primary: true }]

// No modal de criar projeto, o seletor de contratante saía com a setinha
// cinza nativa do Chrome, logo acima de um "Template (opcional)" desenhado no
// padrão do projeto — dois controles de escolha com aparências diferentes na
// mesma tela. A causa era simples: este componente montava <select> na mão em
// vez de usar o Select de components/ui.
describe('ProjectClientsField — controles no padrão do projeto', () => {
  it('cliente e papel usam o Select do projeto, não o do navegador', async () => {
    render(<ProjectClientsField itens={UM_CONTRATANTE} onChange={() => {}} />)

    await waitFor(() => {
      const gatilhos = screen
        .queryAllByRole('button')
        .filter((b) => b.getAttribute('aria-haspopup') === 'listbox')
      expect(gatilhos).toHaveLength(2)
    })

    const nativosVisiveis = [...document.querySelectorAll('select')].filter(
      (s) => !s.className.includes('sr-only') && s.getAttribute('aria-hidden') !== 'true' && !s.hidden,
    )
    expect(nativosVisiveis).toHaveLength(0)
  })

  // O Select do projeto rende DUAS coisas com o mesmo texto: o gatilho que se
  // vê e um <select> escondido que existe para validação e acessibilidade.
  // Por isso estas asserções olham o gatilho, e não o documento inteiro — uma
  // busca solta por texto acha os dois e não prova que o usuário enxerga algo.
  function textoDosGatilhos() {
    return screen
      .queryAllByRole('button')
      .filter((b) => b.getAttribute('aria-haspopup') === 'listbox')
      .map((b) => b.textContent)
  }

  it('o cliente já escolhido aparece escrito no controle', async () => {
    // Garante que a troca não quebrou o vínculo valor→rótulo: o Select resolve
    // o texto a partir das <option>, não mostra o value cru.
    render(<ProjectClientsField itens={UM_CONTRATANTE} onChange={() => {}} />)
    await waitFor(() => expect(textoDosGatilhos().join('|')).toContain('Construtora Aurora'))
  })

  it('o papel escolhido aparece escrito no controle', async () => {
    render(<ProjectClientsField itens={UM_CONTRATANTE} onChange={() => {}} />)
    await waitFor(() => expect(textoDosGatilhos().join('|')).toContain('Contratante principal'))
  })
})
