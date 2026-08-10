// Prepara a role read-only para os testes: define uma senha efêmera (a migration
// criou a role SEM senha) e monta AGENT_READONLY_DATABASE_URL a partir da
// DATABASE_URL de teste, trocando só as credenciais.
import { query } from './db.js'

export async function ensureRoRole(pw = 'ro_test_pw') {
  await query(`ALTER ROLE agent_readonly LOGIN PASSWORD '${pw}'`)
  const u = new URL(process.env.DATABASE_URL)
  u.username = 'agent_readonly'
  u.password = pw
  // Força IPv4: em Windows, `localhost` pode cair em ::1 e o Docker só escuta em 127.0.0.1.
  if (u.hostname === 'localhost') u.hostname = '127.0.0.1'
  process.env.AGENT_READONLY_DATABASE_URL = u.toString()
}
