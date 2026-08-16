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
