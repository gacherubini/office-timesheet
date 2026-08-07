import {
  Home,
  ListChecks,
  FolderKanban,
  Users,
  CalendarDays,
  BarChart3,
  FileText,
  Gift,
  Receipt,
} from 'lucide-react'

// Ferramentas de admin, aninhadas sob Performance.
const ADMIN_TOOLS = [
  { to: '/admin/reports', label: 'Relatórios', icon: BarChart3 },
  { to: '/admin/time-entries', label: 'Apontamentos', icon: FileText },
  { to: '/admin/manage-bonuses', label: 'Bônus', icon: Gift },
  { to: '/admin/manage-expenses', label: 'Despesas', icon: Receipt },
]

export function buildNav({ isAdmin = false, isAdministrativeIntern = false } = {}) {
  const homeTo = isAdmin
    ? '/admin/dashboard'
    : isAdministrativeIntern
      ? '/admin/approvals'
      : '/dashboard'

  const items = [
    { to: homeTo, label: 'Início', icon: Home },
    { to: '/tarefas', label: 'Tarefas', icon: ListChecks },
    { to: '/projetos', label: 'Projetos', icon: FolderKanban },
    { to: '/pessoas', label: 'Pessoas', icon: Users },
    { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  ]

  // Estagiário administrativo não acessa Performance.
  if (!isAdministrativeIntern) {
    items.push({
      to: '/performance',
      label: 'Performance',
      icon: BarChart3,
      children: isAdmin ? ADMIN_TOOLS : undefined,
    })
  }

  return items
}
