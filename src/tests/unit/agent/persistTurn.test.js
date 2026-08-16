import { describe, it, expect } from 'vitest'
import { toPersistedRows, messagesToUi } from '../../../lib/agent/persistTurn.js'

describe('toPersistedRows + messagesToUi (§8.4)', () => {
  it('user: texto_visivel ≠ content quando há anexo', () => {
    const rows = toPersistedRows({
      novos: [{ role: 'user', content: '<<<ANEXO>>>brief.pdf\n...\npergunta' }],
      textoDigitado: 'pergunta',
      anexoNome: 'brief.pdf',
      eventos: [],
      lastAnswer: null,
    })
    expect(rows[0].content).toBe('<<<ANEXO>>>brief.pdf\n...\npergunta')
    expect(rows[0].ui).toEqual({ texto_visivel: 'pergunta', anexo: 'brief.pdf' })
  })

  it('sem anexo a chave some do ui do user', () => {
    const rows = toPersistedRows({
      novos: [{ role: 'user', content: 'oi' }],
      textoDigitado: 'oi', anexoNome: null, eventos: [], lastAnswer: null,
    })
    expect(rows[0].ui).toEqual({ texto_visivel: 'oi' })
    expect(rows[0].ui).not.toHaveProperty('anexo')
  })

  it('assistant intermediário de tool sai com ui null; GET pula', () => {
    const rows = toPersistedRows({
      novos: [
        { role: 'user', content: 'oi' },
        { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'listar_equipe', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'c1', content: '{}' },
        { role: 'assistant', content: 'tem 1' },
      ],
      textoDigitado: 'oi', anexoNome: null,
      eventos: [{ type: 'answer', text: 'tem 1' }],
      lastAnswer: 'tem 1',
    })
    expect(rows[1].ui).toBeNull()
    expect(rows[2].ui).toBeNull()
    const ui = messagesToUi(rows)
    expect(ui.map((m) => m.autor)).toEqual(['user', 'bot'])
    expect(ui[1].texto).toBe('tem 1')
  })

  it('proposal gruda no assistant da escrita; files no assistant do answer', () => {
    const rows = toPersistedRows({
      novos: [
        { role: 'user', content: 'cria' },
        { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'propor_criar_task', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'c1', content: JSON.stringify({ status: 'proposta_emitida' }) },
      ],
      textoDigitado: 'cria', anexoNome: null,
      eventos: [{ type: 'proposal', descricao: 'Criar X', dados: { titulo: 'X' } }],
      lastAnswer: null,
    })
    expect(rows[1].ui.proposta).toEqual({ descricao: 'Criar X', dados: { titulo: 'X' } })
    expect(rows[1].ui.proposta.proposalId).toBeUndefined()
  })

  it('files grudam no assistant do answer (não no intermediário)', () => {
    const rows = toPersistedRows({
      novos: [
        { role: 'user', content: 'gera' },
        { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'gerar_relatorio', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'c1', content: '{}' },
        { role: 'assistant', content: 'pronto' },
      ],
      textoDigitado: 'gera', anexoNome: null,
      eventos: [
        { type: 'file', token: 't1', filename: 'rel.xlsx', mime: 'application/vnd.ms-excel', bytes: 10 },
        { type: 'answer', text: 'pronto' },
      ],
      lastAnswer: 'pronto',
    })
    expect(rows[1].ui).toBeNull()
    expect(rows[2].ui).toBeNull()
    expect(rows[3].ui.arquivos).toEqual([
      { token: 't1', filename: 'rel.xlsx', mime: 'application/vnd.ms-excel', bytes: 10 },
    ])
    const ui = messagesToUi(rows)
    expect(ui).toHaveLength(2)
    expect(ui[1].arquivos).toHaveLength(1)
    expect(ui[1].texto).toBe('pronto')
  })

  it('novos sem assistant.content + lastAnswer → acrescenta a row do fallback', () => {
    const rows = toPersistedRows({
      novos: [{ role: 'user', content: 'asdf' }],
      textoDigitado: 'asdf', anexoNome: null,
      eventos: [{ type: 'answer', text: 'Não entendi' }],
      lastAnswer: 'Não entendi',
    })
    expect(rows.at(-1)).toMatchObject({ role: 'assistant', content: 'Não entendi' })
  })

  it('sem lastAnswer não inventa assistant', () => {
    const rows = toPersistedRows({
      novos: [{ role: 'user', content: 'oi' }],
      textoDigitado: 'oi', anexoNome: null, eventos: [], lastAnswer: null,
    })
    expect(rows.some((r) => r.role === 'assistant')).toBe(false)
  })

  it('resume de proposta marca expirado e GET mostra o card', () => {
    const rows = toPersistedRows({
      novos: [
        { role: 'user', content: 'cria' },
        { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'propor_criar_task', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'c1', content: JSON.stringify({ status: 'proposta_emitida' }) },
      ],
      textoDigitado: 'cria', anexoNome: null,
      eventos: [{ type: 'proposal', descricao: 'Criar X', dados: { titulo: 'X' } }],
      lastAnswer: null,
    })
    const ui = messagesToUi(rows)
    expect(ui.map((m) => m.autor)).toEqual(['user', 'bot'])
    expect(ui[1].proposta).toEqual({ descricao: 'Criar X', dados: { titulo: 'X' }, expirado: true })
    expect(ui[1].texto).toBe('')
  })

  it('assistant só com ui.erro aparece no GET', () => {
    const ui = messagesToUi([
      { role: 'assistant', content: null, ui: { erro: 'falhou' } },
    ])
    expect(ui).toHaveLength(1)
    expect(ui[0].autor).toBe('bot')
  })
})

describe('procedência sobrevive ao reload', () => {
  const FONTES = [{ rotulo: 'Custo por projeto', detalhe: 'este mês', count: 14 }]

  it('o evento sources gruda no assistant que tem a resposta', () => {
    const rows = toPersistedRows({
      novos: [
        { role: 'user', content: 'quanto custou?' },
        { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'custo_por_projeto', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'c1', content: '{}' },
        { role: 'assistant', content: 'R$ 42.310.' },
      ],
      textoDigitado: 'quanto custou?', anexoNome: null,
      eventos: [{ type: 'sources', items: FONTES }, { type: 'answer', text: 'R$ 42.310.' }],
      lastAnswer: 'R$ 42.310.',
    })
    const comResposta = rows.find((r) => r.role === 'assistant' && r.content)
    expect(comResposta.ui).toEqual({ fontes: FONTES })
  })

  it('o GET devolve as fontes junto com a bolha', () => {
    const ui = messagesToUi([
      { role: 'user', content: 'quanto custou?', ui: { texto_visivel: 'quanto custou?' } },
      { role: 'assistant', content: 'R$ 42.310.', ui: { fontes: FONTES } },
    ])
    expect(ui[1]).toMatchObject({ autor: 'bot', texto: 'R$ 42.310.', fontes: FONTES })
  })

  it('sem fontes a chave não aparece — nada de rodapé vazio', () => {
    const rows = toPersistedRows({
      novos: [{ role: 'user', content: 'oi' }, { role: 'assistant', content: 'olá' }],
      textoDigitado: 'oi', anexoNome: null,
      eventos: [{ type: 'answer', text: 'olá' }], lastAnswer: 'olá',
    })
    expect(rows.find((r) => r.role === 'assistant').ui).toBeNull()
    expect(messagesToUi([{ role: 'assistant', content: 'olá', ui: null }])[0].fontes).toBeUndefined()
  })

  it('fontes convivem com arquivos na mesma bolha', () => {
    const rows = toPersistedRows({
      novos: [{ role: 'user', content: 'relatório' }, { role: 'assistant', content: 'Pronto.' }],
      textoDigitado: 'relatório', anexoNome: null,
      eventos: [
        { type: 'sources', items: FONTES },
        { type: 'file', token: 't1', filename: 'r.pdf', mime: 'application/pdf', bytes: 10 },
        { type: 'answer', text: 'Pronto.' },
      ],
      lastAnswer: 'Pronto.',
    })
    const alvo = rows.find((r) => r.role === 'assistant' && r.content)
    expect(alvo.ui.fontes).toEqual(FONTES)
    expect(alvo.ui.arquivos).toHaveLength(1)
  })
})

describe('id da mensagem chega ao cliente (para avaliar)', () => {
  it('messagesToUi carrega o id da bolha do bot', () => {
    const ui = messagesToUi([
      { id: 'u1', role: 'user', content: 'oi', ui: { texto_visivel: 'oi' } },
      { id: 'a1', role: 'assistant', content: 'olá', ui: null },
    ])
    expect(ui[1].id).toBe('a1')
  })

  it('sem id no banco a bolha continua renderizável — só não dá pra avaliar', () => {
    const ui = messagesToUi([{ role: 'assistant', content: 'olá', ui: null }])
    expect(ui[0].texto).toBe('olá')
    expect(ui[0].id).toBeUndefined()
  })
})
