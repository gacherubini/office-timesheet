// Rotas admin do agente: custo/crédito e backlog de pedidos não atendidos.
// Montado sob /admin (app.js) — paths aqui NÃO repetem /admin. Tudo atrás de
// requireAuth + requireAdmin.
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { resumoDoMes } from '../lib/agent/usageRepo.js'
import { getBalance, BalanceIndisponivel } from '../lib/agent/deepseekBalance.js'
import { precosAtivos, precosConfigurados } from '../lib/agent/audit.js'
import { listar, atualizarStatus, STATUS_VALIDOS } from '../lib/agent/featureRequestsRepo.js'

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
      gasto: {
        moeda: 'USD',
        totalUsd: resumo.totalUsd,
        porDia: resumo.porDia,
        precosConfigurados: precosConfigurados(),
        precos: precosAtivos(),
      },
    })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

router.get('/agent/feature-requests', requireAuth, requireAdmin, async (req, res) => {
  try {
    return res.json(await listar())
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

router.patch('/agent/feature-requests/:id', requireAuth, requireAdmin, async (req, res) => {
  const { status } = req.body || {}
  if (!STATUS_VALIDOS.includes(status)) {
    return res.status(400).json({ error: `status inválido; use um de: ${STATUS_VALIDOS.join(', ')}` })
  }
  try {
    const row = await atualizarStatus(req.params.id, status)
    if (!row) return res.status(404).json({ error: 'pedido não encontrado' })
    return res.json(row)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

export default router
