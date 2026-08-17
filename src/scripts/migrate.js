import 'dotenv/config'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import pg from 'pg'

const { Pool } = pg

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations')

export async function runMigrations(pool) {
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

// Piso de senha do próprio app (routes/auth.js, /auth/reset-password). O seed
// não pode criar uma senha que a tela de trocar senha recusaria depois.
const PISO_SENHA = 6

// `INITIAL_ADMINS`: pessoas separadas por `;`, campos por `|`.
//   Nome|email|senha;Outro Nome|outro@email|senha
// Recusa ALTO em vez de pular quieto: no formato antigo, um secret torto virava
// um `SEED skip` no log e a API subia sem admin nenhum — produção de pé e
// ninguém consegue entrar. Cada throw aqui é um jeito real de errar o secret.
export function parseAdminsSeed(env = process.env) {
  const bruto = (env.INITIAL_ADMINS || '').trim()

  if (!bruto) {
    // O par antigo continua valendo: já está nos secrets do Fly e no runbook.
    const email = (env.INITIAL_ADMIN_EMAIL || '').trim()
    const password = env.INITIAL_ADMIN_PASSWORD || ''
    if (!email || !password) return []
    return [{ name: 'Admin', email: email.toLowerCase(), password }]
  }

  const admins = []
  const vistos = new Set()
  const entradas = bruto.split(';').map((e) => e.trim()).filter(Boolean)

  entradas.forEach((entrada, i) => {
    const onde = `INITIAL_ADMINS, entrada ${i + 1}`
    // Apara cada campo: espaço sobrando ao colar o secret é acidente, não senha.
    const campos = entrada.split('|').map((c) => c.trim())
    if (campos.length !== 3) {
      throw new Error(`${onde}: esperava 3 campos no formato Nome|email|senha, veio ${campos.length}.`)
    }
    const [name, emailBruto, password] = campos
    const email = emailBruto.toLowerCase()
    if (!name) throw new Error(`${onde}: nome vazio.`)
    if (!email.includes('@')) throw new Error(`${onde}: e-mail inválido (${emailBruto}).`)
    if (password.length < PISO_SENHA) {
      throw new Error(`${onde}: senha com menos de ${PISO_SENHA} caracteres — o app recusaria essa senha na tela de troca.`)
    }
    if (vistos.has(email)) throw new Error(`${onde}: e-mail repetido (${email}).`)
    vistos.add(email)
    admins.push({ name, email, password })
  })

  return admins
}

async function seedInitialAdmin(pool) {
  // A checagem de tabela vazia vem ANTES do parse de propósito: um secret torto
  // não pode derrubar o boot de um banco que já tem gente dentro. Só no cenário
  // de banco zerado é que a config errada precisa gritar.
  const { rows } = await pool.query('SELECT count(*)::int AS c FROM users')
  if (rows[0].c > 0) {
    console.log('SEED skip: tabela users já tem registros.')
    return
  }

  const admins = parseAdminsSeed(process.env)
  if (admins.length === 0) {
    console.log('SEED skip: INITIAL_ADMINS (ou INITIAL_ADMIN_EMAIL/PASSWORD) não definidas.')
    return
  }

  for (const { name, email, password } of admins) {
    const hash = await bcrypt.hash(password, 10)
    await pool.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, 'admin')`,
      [email, hash, name],
    )
    console.log(`SEED ok: admin criado (${email}).`)
  }
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

// Só executa quando chamado direto (`node scripts/migrate.js`), não quando
// importado pelos testes (que reusam runMigrations com um pool próprio).
const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
