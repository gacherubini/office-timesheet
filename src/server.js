import 'dotenv/config'
import express from 'express'
import cors from 'cors'

import meRoutes from './routes/me.js'
import projectsRoutes from './routes/projects.js'
import timeEntriesRoutes from './routes/timeEntries.js'
import authRoutes from './routes/auth.js'
import usersRoutes from './routes/users.js'
import reportsRoutes from './routes/reports.js'
import dashboardRoutes from './routes/dashboard.js'
import expensesRoutes from './routes/expenses.js'
import bonusesRoutes from './routes/bonuses.js'
import clientsRoutes from './routes/clients.js'
import suppliersRoutes from './routes/suppliers.js'


const app = express()

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN ? process.env.ALLOWED_ORIGIN.split(',') : true,
}))
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.use(meRoutes)
app.use('/admin', usersRoutes)
app.use(authRoutes)
app.use(projectsRoutes)
app.use(timeEntriesRoutes)
app.use(expensesRoutes)
app.use(bonusesRoutes)
app.use(clientsRoutes)
app.use(suppliersRoutes)
app.use('/admin', reportsRoutes)
app.use('/admin', dashboardRoutes)

const port = process.env.PORT || 3333

app.listen(port, () => {
  console.log(`API rodando em http://localhost:${port}`)
})
