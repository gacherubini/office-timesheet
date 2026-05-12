import 'dotenv/config'
import express from 'express'
import cors from 'cors'

import { pool } from './lib/db.js'

import meRoutes from './routes/me.js'
import projectsRoutes from './routes/projects.js'
import timeEntriesRoutes from './routes/timeEntries.js'
import authRoutes from './routes/auth.js'
import usersRoutes from './routes/users.js'
import reportsRoutes from './routes/reports.js'
import dashboardRoutes from './routes/dashboard.js'
import expensesRoutes from './routes/expenses.js'
import vacationsRoutes from './routes/vacations.js'
import bonusesRoutes from './routes/bonuses.js'
import clientsRoutes from './routes/clients.js'
import suppliersRoutes from './routes/suppliers.js'

const app = express()

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN ? process.env.ALLOWED_ORIGIN.split(',') : true,
}))
app.use(express.json())

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ ok: true, db: 'up' })
  } catch (err) {
    res.status(503).json({ ok: false, db: 'down', error: err.message })
  }
})

app.use(meRoutes)
app.use('/admin', usersRoutes)
app.use(authRoutes)
app.use(projectsRoutes)
app.use(timeEntriesRoutes)
app.use(expensesRoutes)
app.use(vacationsRoutes)
app.use(bonusesRoutes)
app.use(clientsRoutes)
app.use(suppliersRoutes)
app.use('/admin', reportsRoutes)
app.use('/admin', dashboardRoutes)

const port = process.env.PORT || 3333

async function start() {
  // Garante que o DB tá acessível antes de aceitar requests
  await pool.query('SELECT 1')
  app.listen(port, () => {
    console.log(`API rodando em http://localhost:${port}`)
  })
}

start().catch((err) => {
  console.error('Falha ao iniciar API:', err)
  process.exit(1)
})
