import express from 'express'
import cors from 'cors'

import { pool } from './lib/db.js'
import { localUploadsDir } from './lib/storage.js'
import { requestLogger } from './middleware/requestLogger.js'

import meRoutes from './routes/me.js'
import usersBasicRoutes from './routes/usersBasic.js'
import projectsRoutes from './routes/projects.js'
import projectManagementRoutes from './routes/projectManagement.js'
import projectTemplatesRoutes from './routes/projectTemplates.js'
import taskCollaborationRoutes from './routes/taskCollaboration.js'
import notificationsRoutes from './routes/notifications.js'
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
import holidaysRoutes from './routes/holidays.js'
import calendarRoutes from './routes/calendar.js'
import presencesRoutes from './routes/presences.js'

// Constrói e exporta o app Express (sem escutar porta). Assim o server.js
// sobe a porta em produção e os testes (Supertest) usam o app direto.
const app = express()

// No Fly a API fica atrás do proxy da plataforma. Sem isso req.ip registra o IP
// interno do proxy — igual para todo mundo, portanto inútil.
app.set('trust proxy', true)

// Antes de tudo: cronometra e identifica o request desde o primeiro byte.
app.use(requestLogger)

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN ? process.env.ALLOWED_ORIGIN.split(',') : true,
}))
app.use(express.json())

// Fallback local de storage: serve arquivos gravados em src/uploads/
app.use('/uploads', express.static(localUploadsDir))

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
app.use(usersBasicRoutes)
app.use(authRoutes)
app.use(projectsRoutes)
app.use(projectManagementRoutes)
app.use(projectTemplatesRoutes)
app.use(taskCollaborationRoutes)
app.use(notificationsRoutes)
app.use(timeEntriesRoutes)
app.use(expensesRoutes)
app.use(vacationsRoutes)
app.use(bonusesRoutes)
app.use(clientsRoutes)
app.use(suppliersRoutes)
app.use(holidaysRoutes)
app.use(calendarRoutes)
app.use(presencesRoutes)
app.use('/admin', reportsRoutes)
app.use('/admin', dashboardRoutes)

export { app }
