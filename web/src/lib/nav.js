import {
  Home,
  ListChecks,
  FolderKanban,
  Users,
  CalendarDays,
  Sparkles,
  BarChart3,
  FileText,
  Gift,
  Receipt,
  Plane,
  History,
  Wallet,
} from 'lucide-react'

// Ferramentas de admin, aninhadas sob Performance.
const ADMIN_TOOLS = [
  { to: '/admin/reports', label: 'Relatórios', icon: BarChart3 },
  { to: '/admin/time-entries', label: 'Apontamentos', icon: FileText },
  { to: '/admin/manage-bonuses', label: 'Bônus', icon: Gift },
  { to: '/admin/manage-expenses', label: 'Despesas', icon: Receipt },
  { to: '/admin/costs-requests', label: 'Custos & Pedidos', icon: Wallet },
]

// Solicitações próprias de férias (pedir / apagar) — todos os papéis.
const AGENDA_TOOLS = [
  { to: '/vacations', label: 'Minhas férias', icon: Plane },
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
    { to: '/agenda', label: 'Agenda', icon: CalendarDays, children: AGENDA_TOOLS },
  ]

  // Histórico dos próprios apontamentos + solicitação de alteração de ponto.
  // O admin tem a visão consolidada da equipe em Performance › Apontamentos.
  if (!isAdmin) {
    items.push({ to: '/history', label: 'Histórico', icon: History })
  }

  // Assistente (agente): visível a todos os papéis. O kill switch do front
  // some com a aba quando VITE_AGENT_ENABLED === 'false'.
  if (import.meta.env.VITE_AGENT_ENABLED !== 'false') {
    items.push({ to: '/assistente', label: 'Assistente', icon: Sparkles })
  }

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
