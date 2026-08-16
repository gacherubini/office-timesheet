import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser } from '../../helpers/factories.js'
import { loadSession, saveTurn, sessionCount, appendExecutionNote, turnoPersistivel, RETENTION_MS } from '../../../lib/agent/session.js'
import { insertTurn, getForOwner, listForOwner, rename, remove } from '../../../lib/agent/conversationsRepo.js'
import { toPersistedRows } from '../../../lib/agent/persistTurn.js'

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

function rowsDe(novos, texto) {
  return toPersistedRows({
    novos,
    textoDigitado: texto,
    anexoNome: null,
    eventos: novos.some((m) => m.role === 'assistant' && m.content)
      ? [{ type: 'answer', text: novos.find((m) => m.role === 'assistant' && m.content).content }]
      : [],
    lastAnswer: novos.find((m) => m.role === 'assistant' && m.content)?.content ?? null,
  })
}

describe('conversationsRepo', () => {
  let emp
  beforeEach(async () => {
    await resetDb()
    emp = await makeUser({ role: 'employee' })
  })

  it('loadSession sem id → persistido false, messages vazias, sessionCount inalterado', async () => {
    const before = await sessionCount()
    const s = await loadSession(undefined, emp)
    expect(s.persistido).toBe(false)
    expect(s.messages).toEqual([])
    expect(s.id).toBeTruthy()
    expect(await sessionCount()).toBe(before)
  })

  it('miss com id de outro user → UUID novo, linha do dono intacta, sem unique-violation', async () => {
    const dono = emp
    const outro = await makeUser({ role: 'employee' })
    const a = await loadSession(undefined, dono)
    await insertTurn(a.id, dono, rowsDe(turnoSimples(0), 'q0'))
    expect(await sessionCount()).toBe(1)

    const miss = await loadSession(a.id, outro)
    expect(miss.id).not.toBe(a.id)
    expect(miss.persistido).toBe(false)
    expect(miss.messages).toEqual([])

    const donoRow = await getForOwner(a.id, dono.id, dono.role)
    expect(donoRow).toBeTruthy()
    expect(donoRow.title).toBeTruthy()

    await insertTurn(miss.id, outro, rowsDe(turnoSimples(1), 'q1'))
    expect(await sessionCount()).toBe(2)
    expect(await getForOwner(a.id, dono.id, dono.role)).toBeTruthy()
    expect(await getForOwner(miss.id, outro.id, outro.role)).toBeTruthy()
  })

  it('insertTurn cria a linha com o UUID mintado; title truncado do texto_visivel', async () => {
    const s = await loadSession(undefined, emp)
    const texto = `${'palavra '.repeat(20)}fim`
    const rows = toPersistedRows({
      novos: [{ role: 'user', content: texto }, { role: 'assistant', content: 'ok' }],
      textoDigitado: texto,
      anexoNome: null,
      eventos: [{ type: 'answer', text: 'ok' }],
      lastAnswer: 'ok',
    })
    await insertTurn(s.id, emp, rows)
    const conv = await getForOwner(s.id, emp.id, emp.role)
    expect(conv).toBeTruthy()
    expect(conv.id).toBe(s.id)
    const esperado = texto.replace(/\s+/g, ' ').trim().slice(0, 60)
    expect(conv.title).toBe(esperado)
    expect(conv.title.length).toBe(60)
  })

  it('janela de 10 blocos íntegros (não começa com tool nem deixa tool_calls órfão)', async () => {
    const a = await loadSession(undefined, emp)
    for (let i = 0; i < 3; i++) await saveTurn(a.id, emp, turnoSimples(i))
    await saveTurn(a.id, emp, turnoComTool(3))
    for (let i = 4; i < 13; i++) await saveTurn(a.id, emp, turnoSimples(i))

    const b = await loadSession(a.id, emp)
    expect(b.persistido).toBe(true)
    expect(b.messages[0].role).not.toBe('tool')
    expect(orfaosDeToolCall(b.messages)).toEqual([])
    const { rows } = await query(
      'SELECT count(*)::int AS c FROM agent_messages WHERE conversation_id = $1',
      [a.id],
    )
    expect(rows[0].c).toBeGreaterThan(b.messages.length)
  })

  it('rename e hard delete', async () => {
    const s = await loadSession(undefined, emp)
    await insertTurn(s.id, emp, rowsDe(turnoSimples(0), 'q0'))
    const renamed = await rename(s.id, emp.id, 'Novo título')
    expect(renamed.title).toBe('Novo título')
    expect((await getForOwner(s.id, emp.id, emp.role)).title).toBe('Novo título')

    const ok = await remove(s.id, emp.id)
    expect(ok).toBe(true)
    expect(await getForOwner(s.id, emp.id, emp.role)).toBeNull()
    expect(await sessionCount()).toBe(0)
    const { rows } = await query('SELECT count(*)::int AS c FROM agent_messages')
    expect(rows[0].c).toBe(0)
  })

  it('miss por outro role — transcript antigo intacto', async () => {
    const s = await loadSession(undefined, emp)
    await saveTurn(s.id, emp, turnoSimples(0))
    const admin = { id: emp.id, role: 'admin' }
    const miss = await loadSession(s.id, admin)
    expect(miss.id).not.toBe(s.id)
    expect(miss.persistido).toBe(false)
    expect(miss.messages).toEqual([])
    expect(await getForOwner(s.id, emp.id, 'employee')).toBeTruthy()
    expect(await getForOwner(s.id, emp.id, 'admin')).toBeNull()
    expect(await sessionCount()).toBe(1)
  })

  it('purge: last_message_at velho some em insertTurn e em list', async () => {
    const velha = await loadSession(undefined, emp)
    const t0 = 1_000_000
    await insertTurn(velha.id, emp, rowsDe(turnoSimples(0), 'velha'), t0)

    const depois = t0 + RETENTION_MS + 1
    const lista = await listForOwner(emp.id, emp.role, depois)
    expect(lista).toHaveLength(0)
    expect(await sessionCount()).toBe(0)

    const outra = await loadSession(undefined, emp)
    await insertTurn(outra.id, emp, rowsDe(turnoSimples(1), 'ainda viva'), t0)
    const viva = await loadSession(undefined, emp)
    await insertTurn(viva.id, emp, rowsDe(turnoSimples(2), 'nova'), depois)
    expect(await sessionCount()).toBe(1)
    expect(await getForOwner(outra.id, emp.id, emp.role)).toBeNull()
    expect(await getForOwner(viva.id, emp.id, emp.role)).toBeTruthy()
  })

  it('appendExecutionNote grava nota textual no transcript do dono', async () => {
    const s = await loadSession(undefined, emp)
    await saveTurn(s.id, emp, [
      { role: 'user', content: 'cria' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'propor_criar_task', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: JSON.stringify({ status: 'proposta_emitida' }) },
    ])
    await appendExecutionNote(s.id, emp, '✓ Executado: Criar X Novo status: completed.')
    const loaded = await loadSession(s.id, emp)
    expect(loaded.messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: '✓ Executado: Criar X Novo status: completed.',
    })
    expect(loaded.messages.at(-1).ui).toBeUndefined()
    expect(orfaosDeToolCall(loaded.messages)).toEqual([])

    const outro = await makeUser({ role: 'employee' })
    await appendExecutionNote(s.id, outro, 'não deveria gravar')
    const deNovo = await loadSession(s.id, emp)
    expect(deNovo.messages.filter((m) => /não deveria/.test(m.content || ''))).toHaveLength(0)
  })

  it('abort / bloco vazio → COUNT de conversas inalterado (insertTurn não é chamado se !turnoPersistivel)', async () => {
    const before = await sessionCount()
    const sujo = [
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'x', arguments: '{}' } }] },
    ]
    expect(turnoPersistivel(sujo)).toBe(false)
    const vazio = []
    expect(turnoPersistivel(vazio)).toBe(false)
    expect(await sessionCount()).toBe(before)
  })
})
