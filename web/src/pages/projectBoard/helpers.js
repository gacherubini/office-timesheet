// Colunas ativas do quadro. `dot`/`bar` dão a cor de cada coluna.
export const COLUMNS = [
  { key: 'todo', label: 'A fazer', dot: 'bg-slate-400', bar: 'bg-slate-400/70' },
  { key: 'in_progress', label: 'Fazendo', dot: 'bg-amber-500', bar: 'bg-amber-500/80' },
  { key: 'in_review', label: 'Em revisão', dot: 'bg-sky-500', bar: 'bg-sky-500/80' },
  { key: 'done', label: 'Concluído', dot: 'bg-emerald-500', bar: 'bg-emerald-500/80' },
]

// Status terminal fora do quadro ativo (seção recolhível "Abandonados").
export const ABANDONED_STATUS = 'abandoned'

export function statusLabel(status) {
  if (status === ABANDONED_STATUS) return 'Abandonado'
  return COLUMNS.find((c) => c.key === status)?.label || status
}

// 6.5 — urgência a partir do prazo (due_date "YYYY-MM-DD")
// Retorna: { level: 'overdue'|'tight'|'normal'|'none', label, days }
export function urgency(dueDate, status) {
  if (!dueDate || status === 'done' || status === ABANDONED_STATUS) return { level: 'none', label: '', days: null }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${dueDate}T00:00:00`)
  const days = Math.round((due - today) / 86400000)
  if (days < 0) return { level: 'overdue', label: `Atrasada ${Math.abs(days)}d`, days }
  if (days === 0) return { level: 'tight', label: 'Vence hoje', days }
  if (days <= 2) return { level: 'tight', label: `Vence em ${days}d`, days }
  return { level: 'normal', label: `Prazo em ${days}d`, days }
}

export function urgencyClasses(level) {
  if (level === 'overdue') return 'bg-rose-500/15 text-rose-500'
  if (level === 'tight') return 'bg-amber-500/15 text-amber-500'
  if (level === 'normal') return 'bg-surface-alt text-text-secondary'
  return 'hidden'
}

export const PRIORITIES = [
  { key: 'low', label: 'Baixa', dot: 'bg-slate-400', chip: 'bg-slate-400/15 text-slate-500' },
  { key: 'medium', label: 'Média', dot: 'bg-amber-500', chip: 'bg-amber-500/15 text-amber-600' },
  { key: 'high', label: 'Alta', dot: 'bg-rose-500', chip: 'bg-rose-500/15 text-rose-500' },
]

export function priorityMeta(priority) {
  return PRIORITIES.find((p) => p.key === priority) || PRIORITIES[1]
}

export function relativeTime(iso) {
  if (!iso) return ''
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'agora'
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d atrás`
  return new Date(iso).toLocaleDateString('pt-BR')
}

export function notificationText(n) {
  const who = n.actor_name || 'Alguém'
  const task = n.task_title ? `"${n.task_title}"` : 'uma tarefa'
  const project = n.project_name ? `"${n.project_name}"` : 'um projeto'
  if (n.type === 'mention') return `${who} mencionou você em ${task}`
  if (n.type === 'task_assigned') return `${who} atribuiu ${task} a você`
  if (n.type === 'task_comment') return `${who} comentou em ${task}`
  if (n.type === 'time_entry_started') return `${who} iniciou um apontamento em ${project}`
  if (n.type === 'time_entry_stopped') return `${who} parou um apontamento em ${project}`
  return `${who} · ${task}`
}

export function activityText(a) {
  const who = a.actor_name || 'Alguém'
  const d = a.detail || {}
  switch (a.type) {
    case 'created': return `${who} criou a tarefa`
    case 'status_changed': return `${who} mudou o status (${statusLabel(d.from)} → ${statusLabel(d.to)})`
    case 'assignee_changed': return `${who} alterou o responsável`
    case 'title_changed': return `${who} renomeou para "${d.to}"`
    case 'priority_changed': return `${who} mudou a prioridade (${priorityMeta(d.from).label} → ${priorityMeta(d.to).label})`
    case 'comment_added': return `${who} comentou`
    case 'attachment_added': return `${who} anexou ${d.file_name || 'um arquivo'}`
    default: return `${who} · ${a.type}`
  }
}

export function formatShortDate(iso) {
  if (!iso) return ''
  const [, m, d] = String(iso).split('T')[0].split('-')
  return `${d}/${m}`
}

// Relógio ao vivo "HH:MM:SS" pra sessão de cronômetro em andamento.
export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export function formatMinutes(minutes) {
  const total = Math.max(0, Math.round(minutes || 0))
  if (total < 60) return `${total}min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}
