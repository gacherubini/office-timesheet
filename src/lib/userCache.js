// Cache em memória de dados de usuário que são lidos com altíssima frequência:
//   1. o perfil do requireAuth — carregado em TODA requisição autenticada;
//   2. a lista básica de usuários — usada em pickers e menções em várias telas.
//
// Por que memória local (e não Redis): a API roda em 1 instância no Fly
// (min_machines_running = 1, auto_stop_machines = off). Com uma única máquina,
// o cache e as invalidações abaixo são sempre coerentes. Se um dia escalar pra
// várias instâncias, cada uma teria seu próprio cache e as invalidações NÃO
// propagariam entre máquinas — aí seria preciso Redis (ou pub/sub) ou baixar o
// TTL pra algo bem curto. O TTL já serve de rede de segurança pra qualquer
// caminho de escrita que esqueça de chamar invalidateUser().
//
// Segurança: os campos sensíveis à sessão (is_active, deleted_at,
// sessions_valid_after) ficam no perfil cacheado, então todo caminho que os
// altera precisa invalidar (ver chamadas em routes/users.js, routes/me.js e
// routes/auth.js). O TTL limita a janela de staleness se algum for esquecido.

const TTL_MS = Number(process.env.USER_CACHE_TTL_MS) || 60_000

const profiles = new Map() // userId -> { profile, expiresAt }
let basicList = null // { rows, expiresAt } | null

// Kill-switch operacional: com USER_CACHE_DISABLED=1 os getters não servem nada
// (o requireAuth sempre vai ao banco). Permite desligar o cache em produção sem
// redeploy caso ele se comporte mal. Lido em call-time de propósito.
function serveDisabled() {
  return process.env.USER_CACHE_DISABLED === '1'
}

export function getCachedProfile(userId) {
  if (serveDisabled()) return null
  const hit = profiles.get(userId)
  if (!hit) return null
  if (hit.expiresAt <= Date.now()) {
    profiles.delete(userId)
    return null
  }
  // Cópia rasa: req.profile nunca deve ser mutado, mas isso blinda o cache
  // contra qualquer código futuro que o faça.
  return { ...hit.profile }
}

export function setCachedProfile(userId, profile) {
  profiles.set(userId, { profile, expiresAt: Date.now() + TTL_MS })
}

export function getCachedUsersBasic() {
  if (serveDisabled()) return null
  if (!basicList) return null
  if (basicList.expiresAt <= Date.now()) {
    basicList = null
    return null
  }
  return basicList.rows
}

export function setCachedUsersBasic(rows) {
  basicList = { rows, expiresAt: Date.now() + TTL_MS }
}

// Invalida o perfil de um usuário E a lista básica — porque nome, avatar, cargo
// ou status ativo desse usuário aparecem na lista.
export function invalidateUser(userId) {
  if (userId) profiles.delete(userId)
  basicList = null
}

// Invalida só a lista básica. Uso: criação de usuário, que ainda não tem perfil
// cacheado mas passa a compor a lista.
export function invalidateUsersBasic() {
  basicList = null
}

// Zera tudo. Uso: reset entre testes (ver tests/helpers/db.js).
export function clearUserCache() {
  profiles.clear()
  basicList = null
}
