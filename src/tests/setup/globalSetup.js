import pg from 'pg'
import { runMigrations } from '../../scripts/migrate.js'

// Roda uma vez antes de toda a suíte: aplica as migrações no banco de teste.
// Se o banco não estiver acessível (ex.: rodar só os unit tests localmente sem
// docker), avisa e segue — os testes de integração vão falhar alto, os unit não.
export default async function setup() {
  const connectionString =
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/office_timesheet_test'

  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 3000 })
  try {
    await pool.query('SELECT 1')
    await runMigrations(pool)
    console.log('[tests] migrações aplicadas no banco de teste.')
  } catch (err) {
    console.warn(
      `[tests] banco de teste indisponível (${err.message}). ` +
        'Os testes de integração vão falhar; unit tests seguem normalmente.',
    )
  } finally {
    await pool.end()
  }
}
