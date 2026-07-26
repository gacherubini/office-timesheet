import 'dotenv/config'
import pg from 'pg'
import { logger } from './logger.js'

// Mantém colunas DATE (OID 1082) como string "YYYY-MM-DD" em vez de objeto Date,
// para preservar paridade com o que a API retornava no tempo do Supabase.
pg.types.setTypeParser(1082, (val) => val)
// Converte NUMERIC (OID 1700) pra number em vez de string. Evita bugs de
// string concat em reduces/somas no app (ex: "06.5" + "78" = "06.578").
pg.types.setTypeParser(1700, (val) => (val === null ? null : Number(val)))

const { Pool } = pg

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL não configurada.')

// Teto de conexões do pool. Configurável por env (PG_POOL_MAX) — o pool só
// abre conexões sob demanda e fecha as ociosas, então o teto é "quando precisar".
// Regra: PG_POOL_MAX × nº de instâncias < limite de conexões do plano do Postgres.
const poolMax = Number(process.env.PG_POOL_MAX) || 15

export const pool = new Pool({
  connectionString: databaseUrl,
  max: poolMax,
  idleTimeoutMillis: 30_000,
})

pool.on('error', (err) => {
  logger.error({ err: { message: err.message, stack: err.stack } }, 'Erro inesperado no pool do Postgres')
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
