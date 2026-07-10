import 'dotenv/config'

import { pool } from './lib/db.js'
import { app } from './app.js'

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
