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
  birth_date = null,
} = {}) {
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, name, role, hourly_rate, is_active, monthly_income_goal, birth_date)
     VALUES ($1, 'x', $2, $3, $4, $5, $6, $7)
     RETURNING id, email, name, role, hourly_rate, is_active, monthly_income_goal, birth_date`,
    [email || `user-${uniq()}@test.com`, name, role, hourly_rate, is_active, monthly_income_goal, birth_date],
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

// Cronômetro de TAREFA aberto (o botão "Contar horas" do card). Diferente do
// ponto: mora em task_time_logs e é `ended_at IS NULL` que marca "rodando".
// Cria projeto/etapa/tarefa por baixo porque tasks.stage_id é NOT NULL desde a
// migration 051 — quem chama só quer um timer aberto, não montar a hierarquia.
export async function makeOpenTaskTimer({ user_id, started_at = new Date().toISOString() }) {
  const { rows: proj } = await query(
    `INSERT INTO projects (name, status) VALUES ($1, 'active') RETURNING id`,
    [`Projeto ${uniq()}`],
  )
  const { rows: stage } = await query(
    `INSERT INTO project_stages (project_id, name) VALUES ($1, 'Anteprojeto') RETURNING id`,
    [proj[0].id],
  )
  const { rows: task } = await query(
    `INSERT INTO tasks (project_id, title, status, position, stage_id)
     VALUES ($1, 'Planta baixa', 'in_progress', 0, $2) RETURNING id`,
    [proj[0].id, stage[0].id],
  )
  const { rows } = await query(
    `INSERT INTO task_time_logs (task_id, user_id, started_at)
     VALUES ($1, $2, $3)
     RETURNING id, task_id, user_id, started_at, ended_at`,
    [task[0].id, user_id, started_at],
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

export async function makeVacation({ user_id, start_date, end_date, days_count = 1, status = 'approved' }) {
  const { rows } = await query(
    `INSERT INTO vacation_requests (user_id, start_date, end_date, days_count, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, start_date, end_date, status`,
    [user_id, start_date, end_date, days_count, status],
  )
  return rows[0]
}

export const makeApprovedVacation = (opts) => makeVacation({ ...opts, status: 'approved' })
