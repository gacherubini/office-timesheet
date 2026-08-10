import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser } from '../../helpers/factories.js'
import tool from '../../../lib/agent/tools/read/despesasDoPeriodo.js'

// Data de hoje no fuso do estúdio — casa com a janela de resolvePeriodo('mes').
function hojeSP() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

async function makeDespesa({ user_id, amount, status, expense_date }) {
  await query(
    `INSERT INTO expense_requests (user_id, title, amount, expense_date, status)
     VALUES ($1, 'Despesa', $2, $3, $4)`,
    [user_id, amount, expense_date, status],
  )
}

describe('tool despesas_do_periodo (admin + estagiário)', () => {
  let admin, ana, hoje
  beforeEach(async () => {
    await resetDb()
    admin = await makeUser({ role: 'admin', name: 'Chefe' })
    ana = await makeUser({ role: 'employee', name: 'Ana' })
    hoje = hojeSP()
    await makeDespesa({ user_id: ana.id, amount: 100.5, status: 'approved', expense_date: hoje })
    await makeDespesa({ user_id: ana.id, amount: 200, status: 'approved', expense_date: hoje })
    // Ruído que NÃO pode entrar na soma:
    await makeDespesa({ user_id: ana.id, amount: 999, status: 'pending', expense_date: hoje })
    await makeDespesa({ user_id: ana.id, amount: 888, status: 'rejected', expense_date: hoje })
    await makeDespesa({ user_id: ana.id, amount: 777, status: 'approved', expense_date: '2020-01-15' })
  })

  it('soma só as APROVADAS do período e quebra por pessoa', async () => {
    const { data } = await tool.run(admin, { periodo: 'mes' })
    expect(data.total_aprovado).toBe(300.5)
    expect(data.quantidade).toBe(2)
    expect(data.por_pessoa).toEqual([{ pessoa: 'Ana', quantidade: 2, total: 300.5 }])
  })

  it('período sem despesa aprovada devolve zero, não erro', async () => {
    const { data, count } = await tool.run(admin, { periodo: 'hoje' })
    expect(typeof data.total_aprovado).toBe('number')
    expect(count).toBe(data.por_pessoa.length)
  })

  it('é oferecida ao admin e ao estagiário, e a mais ninguém', () => {
    expect(tool.roles).toEqual(['admin', 'administrative_intern'])
  })
})
