import { query, pool } from '../../lib/db.js'
import { clearUserCache } from '../../lib/userCache.js'
import { limparOnline } from '../../lib/onlineUsers.js'

export { query, pool }

// Zera os dados entre testes preservando o schema. CASCADE cuida das tabelas
// que referenciam users/projects (time_entries, pauses, notifications, etc.).
export async function resetDb() {
  await query(`
    TRUNCATE
      users, projects, clients, suppliers,
      time_entries, time_entry_pauses, time_entry_change_requests,
      vacation_requests, notifications
    RESTART IDENTITY CASCADE
  `)
  // O cache de usuário vive no processo e sobrevive entre testes; sem limpar,
  // um perfil de um teste anterior poderia vazar pro seguinte.
  clearUserCache()
  // Presença também vive no processo: sem limpar, um usuário marcado num teste
  // anterior contaria como online no seguinte.
  limparOnline()
}
