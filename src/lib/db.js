import 'dotenv/config'
import pg from 'pg'

// Mantém colunas DATE (OID 1082) como string "YYYY-MM-DD" em vez de objeto Date,
// para preservar paridade com o que a API retornava no tempo do Supabase.
pg.types.setTypeParser(1082, (val) => val)

const { Pool } = pg

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL não configurada.')

export const pool = new Pool({
  connectionString: databaseUrl,
  max: 5,
  idleTimeoutMillis: 30_000,
})

pool.on('error', (err) => {
  console.error('Erro inesperado no pool do Postgres:', err)
})

export async function query(text, params) {
  return pool.query(text, params)
}

export async function withTransaction(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
