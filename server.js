import 'dotenv/config'
import express from 'express'
import cors from 'cors'

import meRoutes from './routes/me.js'
import projectsRoutes from './routes/projects.js'
import timeEntriesRoutes from './routes/timeEntries.js'
import authRoutes from './routes/auth.js'

const app = express()

app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.use(meRoutes)
app.use(authRoutes)
app.use(projectsRoutes)
app.use(timeEntriesRoutes)

const port = process.env.PORT || 3333

app.listen(port, () => {
  console.log(`API rodando em http://localhost:${port}`)
})