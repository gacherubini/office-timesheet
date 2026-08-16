import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { runAgentTurn } from '../../../lib/agent/loop.js'
import * as usageRepo from '../../../lib/agent/usageRepo.js'

const admin = { id: 1, role: 'admin' }

function fakeQueEmite(deltas, message) {
  return {
    async stream(_p, onDelta) {
      for (const d of deltas) onDelta(d)
      return { message, usage: { prompt_tokens: 1, completion_tokens: 1 } }
    },
  }
}

describe('loop — classificador de delta (paint)', () => {
  const prev = process.env.AGENT_STREAM_PAINT
  beforeEach(() => { vi.spyOn(usageRepo, 'insert').mockResolvedValue() })
  afterEach(() => {
    vi.restoreAllMocks()
    if (prev === undefined) delete process.env.AGENT_STREAM_PAINT
    else process.env.AGENT_STREAM_PAINT = prev
  })

  it('paint on + só content → token* + answer canônico', async () => {
    process.env.AGENT_STREAM_PAINT = 'true'
    const eventos = []
    await runAgentTurn({
      client: fakeQueEmite([{ content: 'Ol' }, { content: 'á' }], { role: 'assistant', content: 'Olá' }),
      profile: admin, model: 'x',
      messages: [{ role: 'user', content: 'oi' }],
      emit: (e) => eventos.push(e),
    })
    expect(eventos.filter((e) => e.type === 'token').map((e) => e.text)).toEqual(['Ol', 'á'])
    expect(eventos.filter((e) => e.type === 'answer').map((e) => e.text)).toEqual(['Olá'])
  })

  it('paint on + content depois toolCall → token + token_revoke, sem answer de raciocínio', async () => {
    process.env.AGENT_STREAM_PAINT = 'true'
    const eventos = []
    await runAgentTurn({
      client: fakeQueEmite(
        [{ content: 'penso' }, { toolCall: true }],
        { role: 'assistant', content: 'penso', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'ferramenta_inexistente', arguments: '{}' } }] },
      ),
      profile: admin, model: 'x',
      messages: [{ role: 'user', content: 'oi' }],
      emit: (e) => eventos.push(e),
    })
    expect(eventos.some((e) => e.type === 'token')).toBe(true)
    expect(eventos.some((e) => e.type === 'token_revoke')).toBe(true)
    // ferramenta_inexistente esgota as iterações → FALLBACK_SEM_RESPOSTA, nunca o raciocínio
    const answers = eventos.filter((e) => e.type === 'answer')
    expect(answers.every((e) => !/penso/i.test(e.text))).toBe(true)
  })

  it('paint on + só toolCall → zero token', async () => {
    process.env.AGENT_STREAM_PAINT = 'true'
    const eventos = []
    await runAgentTurn({
      client: fakeQueEmite(
        [{ toolCall: true }],
        { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'ferramenta_inexistente', arguments: '{}' } }] },
      ),
      profile: admin, model: 'x',
      messages: [{ role: 'user', content: 'oi' }],
      emit: (e) => eventos.push(e),
    })
    expect(eventos.filter((e) => e.type === 'token' || e.type === 'token_revoke')).toEqual([])
  })

  it('paint on + só reasoning → zero token e zero answer (turno vazio cai no fallback)', async () => {
    process.env.AGENT_STREAM_PAINT = 'true'
    const eventos = []
    await runAgentTurn({
      client: fakeQueEmite([{ reasoning: true }], { role: 'assistant', content: null }),
      profile: admin, model: 'x',
      messages: [{ role: 'user', content: 'oi' }],
      emit: (e) => eventos.push(e),
    })
    expect(eventos.filter((e) => e.type === 'token')).toEqual([])
    // retry + fallback vazio — answer do FALLBACK_VAZIO, nunca o raciocínio
    const answers = eventos.filter((e) => e.type === 'answer')
    expect(answers.every((e) => !/penso/i.test(e.text))).toBe(true)
  })

  it('paint on (default): mesmo fake de content emite token + answer', async () => {
    delete process.env.AGENT_STREAM_PAINT
    const eventos = []
    await runAgentTurn({
      client: fakeQueEmite([{ content: 'Olá' }], { role: 'assistant', content: 'Olá' }),
      profile: admin, model: 'x',
      messages: [{ role: 'user', content: 'oi' }],
      emit: (e) => eventos.push(e),
    })
    expect(eventos.filter((e) => e.type === 'token').map((e) => e.text)).toEqual(['Olá'])
    expect(eventos.filter((e) => e.type === 'answer').map((e) => e.text)).toEqual(['Olá'])
  })

  it('paint off explícito: não emite token, só answer', async () => {
    process.env.AGENT_STREAM_PAINT = 'false'
    const eventos = []
    await runAgentTurn({
      client: fakeQueEmite([{ content: 'Olá' }], { role: 'assistant', content: 'Olá' }),
      profile: admin, model: 'x',
      messages: [{ role: 'user', content: 'oi' }],
      emit: (e) => eventos.push(e),
    })
    expect(eventos.filter((e) => e.type === 'token')).toEqual([])
    expect(eventos.filter((e) => e.type === 'answer').map((e) => e.text)).toEqual(['Olá'])
  })

  it('paint on + revoke → apaga o pintado e repinta o que vem depois', async () => {
    // O client manda { revoke: true } quando descobre tarde que o texto já
    // pintado era rascunho (fechamento </think> sem abertura). A bolha precisa
    // limpar o que estava lá e voltar a pintar a resposta de verdade.
    process.env.AGENT_STREAM_PAINT = 'true'
    const eventos = []
    await runAgentTurn({
      client: fakeQueEmite(
        [{ content: 'rascunho' }, { revoke: true }, { content: 'Olá' }],
        { role: 'assistant', content: 'Olá' },
      ),
      profile: admin, model: 'x',
      messages: [{ role: 'user', content: 'oi' }],
      emit: (e) => eventos.push(e),
    })
    expect(eventos.some((e) => e.type === 'token_revoke')).toBe(true)
    // depois do revoke a pintura recomeça — 'Olá' não pode ficar mudo
    const depoisDoRevoke = eventos.slice(eventos.findIndex((e) => e.type === 'token_revoke'))
    expect(depoisDoRevoke.filter((e) => e.type === 'token').map((e) => e.text)).toEqual(['Olá'])
    expect(eventos.filter((e) => e.type === 'answer').map((e) => e.text)).toEqual(['Olá'])
  })
})
