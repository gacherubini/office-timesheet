// Allowlist de href do assistente (§6.5). Parse sempre via URL — nunca prefixo cru.
// espelho de src/lib/agent/coletarLinks.js (hrefPermitido).

const DUMMY = 'http://assist.invalid'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const PATHS_SEM_QUERY = new Set([
  '/admin/approvals',
  '/expenses',
  '/vacations',
  '/agenda',
  '/admin/reports',
  '/performance',
  '/history',
  '/pessoas',
  '/profile',
])

function chaves(sp) {
  return [...sp.keys()]
}

function uuidOk(v) {
  return typeof v === 'string' && UUID_RE.test(v)
}

function queryProjetosOk(sp) {
  const keys = chaves(sp)
  if (keys.some((k) => k !== 'project' && k !== 'task')) return false
  if (sp.has('project') && !uuidOk(sp.get('project'))) return false
  if (sp.has('task') && !uuidOk(sp.get('task'))) return false
  return true
}

function queryTarefasOk(sp) {
  const keys = chaves(sp)
  return keys.length === 1 && keys[0] === 'task' && uuidOk(sp.get('task'))
}

export function hrefPermitido(href) {
  if (typeof href !== 'string' || !href) return false
  let url
  try {
    url = new URL(href, DUMMY)
  } catch {
    return false
  }

  const proto = url.protocol
  if (proto === 'javascript:' || proto === 'data:' || proto === 'file:') return false
  if (proto === 'http:' && url.host !== 'assist.invalid') return false

  // Absoluto: host ≠ dummy → só https, sem userinfo, sem porta esquisita.
  if (url.host !== 'assist.invalid') {
    if (proto !== 'https:') return false
    if (url.username || url.password) return false
    if (url.port && url.port !== '443') return false
    return Boolean(url.hostname)
  }

  if (url.hash) return false
  const path = url.pathname
  if (path === '/projetos') return queryProjetosOk(url.searchParams)
  if (path === '/tarefas') return queryTarefasOk(url.searchParams)
  if (PATHS_SEM_QUERY.has(path)) return chaves(url.searchParams).length === 0
  return false
}
