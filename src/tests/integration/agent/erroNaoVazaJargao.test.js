import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { asUser } from '../../helpers/api.js'
import { makeUser, makeProject } from '../../helpers/factories.js'
import { setClient, resetClient } from '../../../lib/agent/client.js'
import { createProposal } from '../../../lib/agent/proposals.js'
import { testSink, clearTestSink } from '../../../lib/logger.js'

const readSse = (res) => res.text.split('\n\n').filter(Boolean).map((f) => JSON.parse(f.replace(/^data: /, '')))

// Simula a falha de produção do print: o provedor esgota as tentativas e o loop
// repropaga um erro cru cheio de jargão. Esse texto NUNCA pode chegar ao usuário.
function fakeQueSempreQuebra() {
  return {
    async stream() {
      throw new Error('o modelo não respondeu após 3 tentativa(s): 400 Invalid assistant message: content or tool_calls must be set')
    },
  }
}

describe('falha de infra não vaza jargão para o usuário', () => {
  let emp
  beforeEach(async () => { await resetDb(); emp = await makeUser({ role: 'employee' }) })
  afterEach(() => resetClient())

  it('usuário vê texto amigável; o motivo real fica no log de quem opera', async () => {
    clearTestSink()
    setClient(fakeQueSempreQuebra())

    const r = await asUser(emp).post('/agent/chat').send({ message: 'quanto cada projeto gastou?' })
    const eventos = readSse(r)

    const erro = eventos.find((e) => e.type === 'error')
    expect(erro).toBeDefined()
    // Amigável, com convite a tentar de novo — e SEM nenhum jargão interno.
    expect(erro.error).toMatch(/tentar de novo|problema/i)
    expect(erro.error).not.toMatch(/400|tool_calls|assistant message|tentativa|invalid/i)

    // O erro real precisa estar registrado no servidor (senão some justo quando quebra).
    const logado = [...testSink].some(
      (l) => l.evt === 'agent_turn_error' && /assistant message|tentativa/i.test(l.err || ''),
    )
    expect(logado).toBe(true)
  })

  it('execute: erro de driver (SQLSTATE) não vaza jargão do Postgres', async () => {
    const proj = await makeProject({ name: 'Acme' })
    const { rows: etapas } = await query(
      `INSERT INTO project_stages (project_id, name) VALUES ($1,'Anteprojeto') RETURNING id`, [proj.id])
    const { rows } = await query(
      `INSERT INTO tasks (project_id, title, status, position, stage_id) VALUES ($1,'Logo','todo',0,$2) RETURNING id`,
      [proj.id, etapas[0].id],
    )
    clearTestSink()
    const { proposalId } = createProposal({
      profile: emp,
      kind: 'editar_task',
      payload: { task_id: rows[0].id, due_date: 'amanhã' },
    })
    const res = await asUser(emp).post(`/agent/actions/${proposalId}/execute`).send({})
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/não consegui|tentar de novo/i)
    expect(res.body.error).not.toMatch(/invalid input|syntax|22007|amanhã/i)
    expect([...testSink].some((l) => l.evt === 'agent_execute_error' && l.code === '22007')).toBe(true)
  })
})
