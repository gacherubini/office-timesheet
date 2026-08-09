// Pool preguiçoso ligado à role SOMENTE-LEITURA (AGENT_READONLY_DATABASE_URL).
// Separado do pool do app (db.js) de propósito: é o ÚNICO caminho por onde o SQL
// ad-hoc passa, e essa conexão fisicamente não escreve (§9, camada 5).
import pg from 'pg'
import { SQL_LIMITS } from '../../guards.js'

// Mesmos type parsers do db.js, caso este módulo seja carregado isolado
// (DATE como string 'YYYY-MM-DD', NUMERIC como number).
pg.types.setTypeParser(1082, (v) => v)
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)))

let roPool = null

export function getRoPool() {
  if (roPool) return roPool
  const url = process.env.AGENT_READONLY_DATABASE_URL
  if (!url) throw new Error('AGENT_READONLY_DATABASE_URL não configurada')
  roPool = new pg.Pool({
    connectionString: url,
    max: Number(process.env.AGENT_SQL_POOL_MAX) || 4,
    idleTimeoutMillis: 30_000,
  })
  return roPool
}

// Roda o SQL (já sanitizado) numa transação READ ONLY com statement_timeout. A
// transação READ ONLY é cinto-e-suspensório sobre a role: mesmo que algo
// escapasse do parser, o Postgres barra a escrita aqui também.
export async function runReadOnly(sql, params = []) {
  const client = await getRoPool().connect()
  try {
    await client.query('BEGIN READ ONLY')
    await client.query(`SET LOCAL statement_timeout = ${SQL_LIMITS.statementTimeoutMs}`)
    const { rows } = await client.query(sql, params)
    await client.query('COMMIT')
    return rows
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
