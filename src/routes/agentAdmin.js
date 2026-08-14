// Rotas admin do agente: custo/crédito e backlog de pedidos não atendidos.
// Montado sob /admin (app.js) — paths aqui NÃO repetem /admin. Tudo atrás de
// requireAuth + requireAdmin.
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { resumoDoMes } from '../lib/agent/usageRepo.js'
import { getBalance, BalanceIndisponivel } from '../lib/agent/deepseekBalance.js'
import { precosConfigurados } from '../lib/agent/audit.js'

const router = Router()

router.get('/agent/costs', requireAuth, requireAdmin, async (req, res) => {
  try {
    const resumo = await resumoDoMes()
    let saldo = null
    let saldoIndisponivel = false
    try {
      saldo = await getBalance()
    } catch (err) {
      if (err instanceof BalanceIndisponivel) saldoIndisponivel = true
      else throw err
    }
    return res.json({
      saldo,
      saldoIndisponivel,
      gasto: { moeda: 'USD', totalUsd: resumo.totalUsd, porDia: resumo.porDia, precosConfigurados: precosConfigurados() },
    })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

export default router
