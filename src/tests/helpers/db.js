import { query, pool } from '../../lib/db.js'

export { query, pool }

// Zera os dados entre testes preservando o schema. CASCADE cuida das tabelas
// que referenciam users/projects (time_entries, pauses, notifications, etc.).
export async function resetDb() {
  await query(`
    TRUNCATE
      users, projects, clients,
      time_entries, time_entry_pauses, time_entry_change_requests,
      vacation_requests, notifications
    RESTART IDENTITY CASCADE
  `)
}
