import { query } from './db.js'

let seq = 0
const uniq = () => `${Date.now()}-${seq++}`

// Cria um usuário. Campos mínimos + defaults sensatos. hourly_rate controla o $.
export async function makeUser({
  role = 'employee',
  hourly_rate = 100,
  name = 'User',
  email,
  is_active = true,
  monthly_income_goal = 0,
} = {}) {
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, name, role, hourly_rate, is_active, monthly_income_goal)
     VALUES ($1, 'x', $2, $3, $4, $5, $6)
     RETURNING id, email, name, role, hourly_rate, is_active, monthly_income_goal`,
    [email || `user-${uniq()}@test.com`, name, role, hourly_rate, is_active, monthly_income_goal],
  )
  return rows[0]
}

export async function makeAdmin(overrides = {}) {
  return makeUser({ role: 'admin', name: 'Admin', ...overrides })
}

export async function makeProject({ name = 'Projeto', status = 'active' } = {}) {
  const { rows } = await query(
    `INSERT INTO projects (name, status) VALUES ($1, $2)
     RETURNING id, name, status`,
    [name, status],
  )
  return rows[0]
}

// Insere um apontamento CONCLUÍDO com timestamps explícitos (determinístico).
// duration_minutes e cost_snapshot podem ser passados; quem calcula o esperado
// é o teste (não reaproveitamos a função do app de propósito).
export async function makeCompletedEntry({
  user_id,
  project_id,
  started_at,
  ended_at,
  duration_minutes,
  cost_snapshot,
}) {
  const { rows } = await query(
    `INSERT INTO time_entries
       (user_id, project_id, started_at, ended_at, status, duration_minutes, cost_snapshot)
     VALUES ($1, $2, $3, $4, 'completed', $5, $6)
     RETURNING id, user_id, project_id, started_at, ended_at, status, duration_minutes, cost_snapshot`,
    [user_id, project_id, started_at, ended_at, duration_minutes, cost_snapshot],
  )
  return rows[0]
}

// Apontamento em andamento com started_at explícito (pra testar stop/duração).
export async function makeRunningEntry({ user_id, project_id, started_at }) {
  const { rows } = await query(
    `INSERT INTO time_entries (user_id, project_id, started_at, status)
     VALUES ($1, $2, $3, 'running')
     RETURNING id, user_id, project_id, started_at, status`,
    [user_id, project_id, started_at],
  )
  return rows[0]
}

export async function makePause({ time_entry_id, paused_at, resumed_at = null }) {
  const { rows } = await query(
    `INSERT INTO time_entry_pauses (time_entry_id, paused_at, resumed_at)
     VALUES ($1, $2, $3)
     RETURNING id, time_entry_id, paused_at, resumed_at`,
    [time_entry_id, paused_at, resumed_at],
  )
  return rows[0]
}

export async function makeApprovedVacation({ user_id, start_date, end_date, days_count = 1 }) {
  const { rows } = await query(
    `INSERT INTO vacation_requests (user_id, start_date, end_date, days_count, status)
     VALUES ($1, $2, $3, $4, 'approved')
     RETURNING id, user_id, start_date, end_date, status`,
    [user_id, start_date, end_date, days_count],
  )
  return rows[0]
}
