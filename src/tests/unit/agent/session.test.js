import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../../helpers/db.js'
import { makeUser } from '../../helpers/factories.js'
import { loadSession, saveTurn, sessionCount, MAX_TURNS, RETENTION_MS, turnoPersistivel } from '../../../lib/agent/session.js'

// Invariante de boa-formação: todo assistant com tool_calls precisa ter, adiante,
// uma resposta role:'tool' para CADA tool_call.id. Devolve os órfãos (vazio = ok).
function orfaosDeToolCall(messages) {
  const orfaos = []
  messages.forEach((msg, i) => {
    if (msg.role !== 'assistant' || !msg.tool_calls) return
    for (const call of msg.tool_calls) {
      const respondido = messages.slice(i + 1).some((m) => m.role === 'tool' && m.tool_call_id === call.id)
      if (!respondido) orfaos.push(call.id)
    }
  })
  return orfaos
}

const turnoSimples = (i) => [
  { role: 'user', content: `q${i}` },
  { role: 'assistant', content: `a${i}` },
]

const turnoComTool = (i) => [
  { role: 'user', content: `q${i}` },
  {
    role: 'assistant',
    content: null,
    tool_calls: [
      { id: `tc-${i}-1`, type: 'function', function: { name: 'ler', arguments: '{}' } },
      { id: `tc-${i}-2`, type: 'function', function: { name: 'ler', arguments: '{}' } },
    ],
  },
  { role: 'tool', tool_call_id: `tc-${i}-1`, content: '{}' },
  { role: 'tool', tool_call_id: `tc-${i}-2`, content: '{}' },
]

describe('session — fachada do Postgres (criação preguiçosa, 30 dias)', () => {
  let emp
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee' })
  })

  it('sem conversation_id abre sessão nova com id, persistido false, sem INSERT', async () => {
    const before = await sessionCount()
    const s = await loadSession(undefined, emp)
    expect(s.id).toBeTruthy()
    expect(s.messages).toEqual([])
    expect(s.persistido).toBe(false)
    expect(await sessionCount()).toBe(before)
  })

  it('retoma conversa persistida', async () => {
    const a = await loadSession(undefined, emp)
    await saveTurn(a.id, emp, [{ role: 'user', content: 'oi' }])
    const b = await loadSession(a.id, emp)
    expect(b.id).toBe(a.id)
    expect(b.persistido).toBe(true)
    expect(b.messages).toHaveLength(1)
    expect(b.messages[0]).toMatchObject({ role: 'user', content: 'oi' })
    expect(b.messages[0].ui).toBeUndefined()
  })

  it('descarta a sessão se o papel mudou (id novo, linha antiga intacta)', async () => {
    const a = await loadSession(undefined, emp)
    await saveTurn(a.id, emp, [{ role: 'user', content: 'oi' }])
    const b = await loadSession(a.id, { id: emp.id, role: 'admin' })
    expect(b.id).not.toBe(a.id)
    expect(b.persistido).toBe(false)
    expect(b.messages).toEqual([])
    const deNovo = await loadSession(a.id, emp)
    expect(deNovo.id).toBe(a.id)
    expect(deNovo.messages).toHaveLength(1)
  })

  it('miss de outro dono devolve UUID novo e não incrementa sessionCount', async () => {
    const outro = await makeUser({ role: 'employee' })
    const a = await loadSession(undefined, emp)
    await saveTurn(a.id, emp, [{ role: 'user', content: 'oi' }])
    const before = await sessionCount()
    const b = await loadSession(a.id, outro)
    expect(b.id).not.toBe(a.id)
    expect(b.persistido).toBe(false)
    expect(await sessionCount()).toBe(before)
  })

  it('janela do modelo corta em MAX_TURNS blocos sem apagar o banco', async () => {
    const a = await loadSession(undefined, emp)
    for (let i = 0; i < MAX_TURNS * 3; i++) await saveTurn(a.id, emp, [{ role: 'user', content: String(i) }])
    const b = await loadSession(a.id, emp)
    expect(b.messages.length).toBeLessThanOrEqual(MAX_TURNS * 2)
    expect(b.messages.filter((m) => m.role === 'user')).toHaveLength(MAX_TURNS)
  })

  it('trunca por BLOCOS de turno: janela retida nunca começa com tool nem deixa tool_calls órfão', async () => {
    const a = await loadSession(undefined, emp)
    for (let i = 0; i < 3; i++) await saveTurn(a.id, emp, turnoSimples(i))
    await saveTurn(a.id, emp, turnoComTool(3))
    for (let i = 4; i < 13; i++) await saveTurn(a.id, emp, turnoSimples(i))

    const b = await loadSession(a.id, emp)
    expect(b.messages[0].role).not.toBe('tool')
    expect(orfaosDeToolCall(b.messages)).toEqual([])
  })

  it('purge de 30 dias ao escrever (last_message_at velho some)', async () => {
    const t0 = 1_000_000
    const velha = await loadSession(undefined, emp)
    await saveTurn(velha.id, emp, [{ role: 'user', content: 'velha' }], t0)
    const depois = t0 + RETENTION_MS + 1
    const viva = await loadSession(undefined, emp)
    await saveTurn(viva.id, emp, [{ role: 'user', content: 'oi' }], depois)
    expect(await sessionCount()).toBe(1)
    const retoma = await loadSession(viva.id, emp)
    expect(retoma.persistido).toBe(true)
    const morta = await loadSession(velha.id, emp)
    expect(morta.persistido).toBe(false)
    expect(morta.id).not.toBe(velha.id)
  })
})

describe('turnoPersistivel', () => {
  it('user + assistant com content é persistível', () => {
    expect(turnoPersistivel([
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'olá' },
    ])).toBe(true)
  })
  it('assistant com tool_calls sem role:tool NÃO é persistível', () => {
    expect(turnoPersistivel([
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'x', arguments: '{}' } }] },
    ])).toBe(false)
  })
  it('proposta_emitida (bloco fechado de escrita) é persistível', () => {
    expect(turnoPersistivel([
      { role: 'user', content: 'cria' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'propor_criar_task', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: JSON.stringify({ status: 'proposta_emitida' }) },
    ])).toBe(true)
  })
  it('tool de leitura sem answer ainda NÃO é persistível', () => {
    expect(turnoPersistivel([
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'listar_equipe', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: '{}' },
    ])).toBe(false)
  })
})
