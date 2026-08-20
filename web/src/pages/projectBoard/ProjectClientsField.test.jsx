/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { ProjectClientsField } from './ProjectClientsField'

vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue([
      { id: 'c1', name: 'Construtora Aurora' },
      { id: 'c2', name: 'Marcos Aurélio' },
    ]),
  },
}))

// jsdom não implementa scrollIntoView, e o Select do projeto chama isso ao abrir
// o dropdown para manter a opção ativa à vista. Sem este remendo, qualquer
// teste que ABRA um seletor morre dentro do componente — nada a ver com a
// regra que está sendo verificada.
Element.prototype.scrollIntoView = () => {}

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

// Fusão do rádio com o Select (ajuste de 20/08/2026). A linha tinha DOIS
// controles dizendo a mesma coisa: um rádio "principal" e um Select de papel
// cuja primeira opção era "Contratante principal". O dono do produto testou e
// marcou vários rádios achando que era assim que se escolhem vários
// contratantes — a tela oferecia duas maneiras de responder à mesma pergunta e
// nenhuma das duas explicava a regra. O rádio saiu; quem tem o papel
// `contratante_principal` É o principal, e `is_primary` virou consequência.
describe('ProjectClientsField — o papel é o único controle do principal', () => {
  const DOIS = [
    { client_id: 'c1', role: 'contratante_principal', is_primary: true },
    { client_id: 'c2', role: 'contratante', is_primary: false },
  ]

  // Os gatilhos do Select saem em pares, na ordem da linha: cliente, papel.
  // (O Select do projeto não repassa aria-label para o gatilho, então buscar
  // por rótulo acharia só o <select> escondido — que não é o que o usuário
  // clica.)
  function gatilhos() {
    return screen
      .queryAllByRole('button')
      .filter((b) => b.getAttribute('aria-haspopup') === 'listbox')
  }

  async function escolherPapel(linha, rotulo) {
    fireEvent.click(gatilhos()[linha * 2 + 1])
    const opcoes = await screen.findAllByRole('option')
    const alvo = opcoes.find((o) => o.textContent.trim() === rotulo)
    expect(alvo).toBeTruthy()
    fireEvent.click(alvo)
  }

  it('o rádio de principal não existe mais', () => {
    render(<ProjectClientsField itens={DOIS} onChange={() => {}} />)
    expect(document.querySelectorAll('input[type="radio"]')).toHaveLength(0)
  })

  // Pedido explícito do dono do produto: a regra tem que estar ESCRITA, não só
  // implícita no comportamento do controle.
  it('a tela explica que só um é o principal e que é ele quem nomeia o projeto', () => {
    render(<ProjectClientsField itens={DOIS} onChange={() => {}} />)
    const apoio = screen.getByText(/só um contratante pode ser o principal/i)
    expect(apoio.textContent).toMatch(/cabeçalho do projeto/i)
  })

  it('escolher o principal numa linha rebaixa quem era', async () => {
    const onChange = vi.fn()
    render(<ProjectClientsField itens={DOIS} onChange={onChange} />)

    await escolherPapel(1, 'Contratante principal')

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toEqual([
      { client_id: 'c1', role: 'contratante', is_primary: false },
      { client_id: 'c2', role: 'contratante_principal', is_primary: true },
    ])
  })

  // A invariante vale para todo caminho, não só para o que o usuário costuma
  // fazer: rebaixar o principal sem eleger outro deixaria o projeto sem quem
  // titula o card, e o servidor promoveria alguém pelas costas do usuário (o
  // principal "pulando" de linha depois de salvar).
  it('rebaixar o principal promove a outra linha na hora', async () => {
    const onChange = vi.fn()
    render(<ProjectClientsField itens={DOIS} onChange={onChange} />)

    await escolherPapel(0, 'Investidor')

    expect(onChange.mock.calls[0][0]).toEqual([
      { client_id: 'c1', role: 'investidor', is_primary: false },
      { client_id: 'c2', role: 'contratante_principal', is_primary: true },
    ])
  })

  it('com um contratante só, ele continua sendo o principal', async () => {
    const onChange = vi.fn()
    render(<ProjectClientsField itens={UM_CONTRATANTE} onChange={onChange} />)

    await escolherPapel(0, 'Investidor')

    // Não há para quem passar o bastão: a troca não pega. O contrário seria
    // aceitar na tela algo que o servidor desfaz no salvamento seguinte.
    expect(onChange.mock.calls[0][0]).toEqual([
      { client_id: 'c1', role: 'contratante_principal', is_primary: true },
    ])
  })

  it('a primeira linha nasce contratante principal; as seguintes, contratante', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<ProjectClientsField itens={[]} onChange={onChange} />)
    const botao = screen.getByLabelText('Adicionar contratante')
    await waitFor(() => expect(botao.disabled).toBe(false))

    fireEvent.click(botao)
    expect(onChange.mock.calls[0][0]).toEqual([
      { client_id: '', role: 'contratante_principal', is_primary: true },
    ])

    rerender(<ProjectClientsField itens={onChange.mock.calls[0][0]} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Adicionar contratante'))
    expect(onChange.mock.calls[1][0]).toEqual([
      { client_id: '', role: 'contratante_principal', is_primary: true },
      { client_id: '', role: 'contratante', is_primary: false },
    ])
  })

  it('remover o principal promove a primeira linha que sobra — papel e is_primary juntos', () => {
    const onChange = vi.fn()
    render(<ProjectClientsField itens={DOIS} onChange={onChange} />)

    fireEvent.click(screen.getAllByLabelText('Remover contratante')[0])

    expect(onChange.mock.calls[0][0]).toEqual([
      { client_id: 'c2', role: 'contratante_principal', is_primary: true },
    ])
  })

  it('remover uma linha comum não mexe em quem é o principal', () => {
    const onChange = vi.fn()
    render(<ProjectClientsField itens={DOIS} onChange={onChange} />)

    fireEvent.click(screen.getAllByLabelText('Remover contratante')[1])

    expect(onChange.mock.calls[0][0]).toEqual([
      { client_id: 'c1', role: 'contratante_principal', is_primary: true },
    ])
  })
})
