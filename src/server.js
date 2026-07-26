import 'dotenv/config'

import { pool } from './lib/db.js'
import { app } from './app.js'
import { logger } from './lib/logger.js'
import { installProcessHandlers } from './middleware/errorHandler.js'

const port = process.env.PORT || 3333

installProcessHandlers(logger)

async function start() {
  // Garante que o DB tá acessível antes de aceitar requests
  await pool.query('SELECT 1')
  app.listen(port, () => {
    logger.info({ port }, `API rodando em http://localhost:${port}`)
  })
}

start().catch((err) => {
  logger.error({ err: { message: err.message, stack: err.stack } }, 'Falha ao iniciar API')
  process.exit(1)
})
