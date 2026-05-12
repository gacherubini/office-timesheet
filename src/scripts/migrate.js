import 'dotenv/config'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import pg from 'pg'

const { Pool } = pg

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations')

async function runMigrations(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const { rows: applied } = await pool.query('SELECT filename FROM _migrations')
  const appliedSet = new Set(applied.map((r) => r.filename))

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`SKIP ${file} (já aplicada)`)
      continue
    }
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO _migrations(filename) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log(`OK   ${file}`)
    } catch (err) {
      await client.query('ROLLBACK')
      console.error(`FAIL ${file}:`, err.message)
      throw err
    } finally {
      client.release()
    }
  }
}

async function seedInitialAdmin(pool) {
  const email = process.env.INITIAL_ADMIN_EMAIL
  const password = process.env.INITIAL_ADMIN_PASSWORD
  if (!email || !password) {
    console.log('SEED skip: INITIAL_ADMIN_EMAIL/INITIAL_ADMIN_PASSWORD não definidas.')
    return
  }
  const { rows } = await pool.query('SELECT count(*)::int AS c FROM users')
  if (rows[0].c > 0) {
    console.log('SEED skip: tabela users já tem registros.')
    return
  }
  const hash = await bcrypt.hash(password, 10)
  await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, 'admin')`,
    [email.toLowerCase().trim(), hash, 'Admin'],
  )
  console.log(`SEED ok: admin criado (${email}).`)
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL não definida.')

  const pool = new Pool({ connectionString: databaseUrl })
  try {
    await runMigrations(pool)
    await seedInitialAdmin(pool)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
