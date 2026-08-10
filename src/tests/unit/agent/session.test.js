import { describe, it, expect } from 'vitest'
import { loadSession, saveTurn, sessionCount, MAX_TURNS, SESSION_TTL_MS } from '../../../lib/agent/session.js'

const emp = { id: 1, role: 'employee' }

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

describe('session — memória efêmera com TTL e carimbo de papel', () => {
  it('sem conversation_id abre sessão nova com id', () => {
    const s = loadSession(undefined, emp, 1000)
    expect(s.id).toBeTruthy()
    expect(s.messages).toEqual([])
  })

  it('retoma a mesma conversa dentro do TTL', () => {
    const a = loadSession(undefined, emp, 1000)
    saveTurn(a.id, emp, [{ role: 'user', content: 'oi' }], 1000)
    const b = loadSession(a.id, emp, 1000 + SESSION_TTL_MS - 1)
    expect(b.id).toBe(a.id)
    expect(b.messages).toHaveLength(1)
  })

  it('expira por inatividade → sessão nova, sem histórico', () => {
    const a = loadSession(undefined, emp, 1000)
    saveTurn(a.id, emp, [{ role: 'user', content: 'oi' }], 1000)
    const b = loadSession(a.id, emp, 1000 + SESSION_TTL_MS + 1)
    expect(b.id).not.toBe(a.id)
    expect(b.messages).toEqual([])
  })

  it('descarta a sessão se o papel mudou', () => {
    const a = loadSession(undefined, emp, 1000)
    saveTurn(a.id, emp, [{ role: 'user', content: 'oi' }], 1000)
    const b = loadSession(a.id, { id: 1, role: 'admin' }, 1200)
    expect(b.id).not.toBe(a.id)
    expect(b.messages).toEqual([])
  })

  it('apara para as últimas MAX_TURNS*2 mensagens', () => {
    const a = loadSession(undefined, emp, 1000)
    for (let i = 0; i < MAX_TURNS * 3; i++) saveTurn(a.id, emp, [{ role: 'user', content: String(i) }], 1000)
    const b = loadSession(a.id, emp, 1000)
    expect(b.messages.length).toBeLessThanOrEqual(MAX_TURNS * 2)
  })

  it('trunca por BLOCOS de turno: janela retida nunca começa com tool nem deixa tool_calls órfão', () => {
    const a = loadSession(undefined, emp, 1000)
    // 3 turnos simples + 1 turno com tool-calling + 9 simples = 13 blocos / 28 msgs.
    // O corte por CONTAGEM BRUTA (slice(-MAX_TURNS*2)) cairia no meio do bloco com
    // tool, deixando um role:'tool' órfão na cabeça da janela reenviada ao provedor.
    for (let i = 0; i < 3; i++) saveTurn(a.id, emp, turnoSimples(i), 1000)
    saveTurn(a.id, emp, turnoComTool(3), 1000)
    for (let i = 4; i < 13; i++) saveTurn(a.id, emp, turnoSimples(i), 1000)

    const b = loadSession(a.id, emp, 1000)
    expect(b.messages[0].role).not.toBe('tool')
    expect(orfaosDeToolCall(b.messages)).toEqual([])
  })

  it('varre sessões vencidas ao escrever (não vaza memória)', () => {
    // base bem à frente dos nows dos outros testes: o expurgo daqui não depende
    // da ordem de execução (qualquer sessão anterior já venceu contra o futuro).
    const base = 10_000_000
    loadSession(undefined, emp, base) // duas sessões velhas
    loadSession(undefined, emp, base)
    const futuro = base + SESSION_TTL_MS + 1
    const viva = loadSession(undefined, emp, futuro) // cria uma viva e dispara o expurgo
    saveTurn(viva.id, emp, [{ role: 'user', content: 'oi' }], futuro)
    // As duas velhas venceram e sumiram; só a viva permanece.
    expect(sessionCount()).toBe(1)
  })
})
