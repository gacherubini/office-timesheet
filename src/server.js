import 'dotenv/config'

import { pool } from './lib/db.js'
import { app } from './app.js'
import { logger } from './lib/logger.js'
import { installProcessHandlers } from './middleware/errorHandler.js'
import { closeAllSseClients } from './lib/notificationsHub.js'

const port = process.env.PORT || 3333

installProcessHandlers(logger)

let server
let shuttingDown = false

async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, 'Encerrando API (graceful shutdown)')

  const forceTimer = setTimeout(() => {
    logger.error('Timeout no graceful shutdown — forçando exit')
    process.exit(1)
  }, 15_000)
  forceTimer.unref?.()

  try {
    closeAllSseClients()
  } catch (err) {
    logger.error({ err: { message: err.message } }, 'Erro ao fechar SSE')
  }

  await new Promise((resolve) => {
    if (!server) return resolve()
    server.close(() => resolve())
  })

  try {
    await pool.end()
  } catch (err) {
    logger.error({ err: { message: err.message } }, 'Erro ao encerrar pool')
  }

  process.exit(0)
}

async function start() {
  // Garante que o DB tá acessível antes de aceitar requests
  await pool.query('SELECT 1')
  server = app.listen(port, () => {
    logger.info({ port }, `API rodando em http://localhost:${port}`)
  })

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

start().catch((err) => {
  logger.error({ err: { message: err.message, stack: err.stack } }, 'Falha ao iniciar API')
  process.exit(1)
})
