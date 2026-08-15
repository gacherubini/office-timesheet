// Extrai deep links de role:tool deste turno (depois do último user).
// hrefPermitido é espelho de web/src/lib/agentLinks.js — mesmas regras §6.5;
// não importar web/ de src/.

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

// espelho de web/src/lib/agentLinks.js
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

function parseContent(content) {
  if (content && typeof content === 'object') return content
  if (typeof content !== 'string') return null
  try { return JSON.parse(content) } catch { return null }
}

function achatar(parsed) {
  if (Array.isArray(parsed)) return parsed
  if (!parsed || typeof parsed !== 'object') return []
  const itens = [parsed]
  if (Array.isArray(parsed.data)) itens.push(...parsed.data)
  return itens
}

export function coletarLinks(messages) {
  if (!Array.isArray(messages)) return []
  let ultimoUser = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') {
      ultimoUser = i
      break
    }
  }
  const turno = messages.slice(ultimoUser + 1)
  const visto = new Set()
  const links = []

  function push(href, label) {
    if (!label || !hrefPermitido(href) || visto.has(href)) return
    visto.add(href)
    links.push({ href, label: String(label) })
  }

  for (const m of turno) {
    if (m?.role !== 'tool') continue
    const parsed = parseContent(m.content)
    if (!parsed) continue
    for (const item of achatar(parsed)) {
      if (!item || typeof item !== 'object') continue
      if (item.projeto_id && item.projeto) {
        push(`/projetos?project=${item.projeto_id}`, item.projeto)
      }
      if (item.tarefa_id && item.titulo) {
        push(`/tarefas?task=${item.tarefa_id}`, item.titulo)
      }
    }
  }
  return links
}
