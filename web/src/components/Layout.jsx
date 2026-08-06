import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
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
  LogOut,
  ChevronDown,
  ChevronRight,
  Pin,
  PinOff,
} from 'lucide-react'
import { Avatar } from './Avatar'
import { NotificationBell } from './NotificationBell'
import { ClockInReminder } from './ClockInReminder'
import { Logo } from './Logo'

// Item de menu de nível 1 (plano, estilo mockup VOID). Ativo em laranja/accent.
function NavRow({ item, active, expanded, open, onToggle }) {
  const Icon = item.icon
  const hasChildren = Boolean(item.children?.length)
  const base =
    'flex items-center gap-3 transition-colors whitespace-nowrap text-[15px] font-medium'
  const pad = expanded ? 'px-6 py-2.5' : 'px-4 md:px-0 py-2.5 md:justify-center'
  const state = active
    ? 'text-accent'
    : 'text-white/65 hover:text-white'

  return (
    <div className="contents md:block">
      <div className="flex items-center">
        <Link
          to={item.to}
          title={!expanded ? item.label : undefined}
          className={`flex-1 ${base} ${pad} ${state}`}
        >
          <Icon size={18} className="flex-none" />
          <span className={`hidden ${expanded ? 'md:inline' : 'md:hidden'}`}>{item.label}</span>
        </Link>
        {hasChildren && expanded && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={open ? `Recolher ${item.label}` : `Expandir ${item.label}`}
            aria-expanded={open}
            className="mr-3 flex h-7 w-7 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {hasChildren && expanded && open && (
        <div className="mb-1">
          {item.children.map((child) => (
            <NavSubRow key={child.to} item={child} />
          ))}
        </div>
      )}
    </div>
  )
}

// Sub-item só-admin (indentado sob o item pai).
function NavSubRow({ item }) {
  const location = useLocation()
  const Icon = item.icon
  const active = location.pathname === item.to
  return (
    <Link
      to={item.to}
      className={`ml-9 mr-3 flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors ${
        active ? 'bg-white/10 text-white font-medium' : 'text-white/50 hover:bg-white/5 hover:text-white'
      }`}
    >
      <Icon size={15} className="flex-none" />
      <span>{item.label}</span>
    </Link>
  )
}

export function Layout({ children }) {
  const { profile, isAdmin, isAdministrativeIntern, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [openSections, setOpenSections] = useState({})
  const [isSidebarHovered, setIsSidebarHovered] = useState(false)
  const [isSidebarPinned, setIsSidebarPinned] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('sidebarPinned') === 'true'
  })

  function handleLogout() {
    logout()
    navigate('/login')
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('sidebarPinned', String(isSidebarPinned))
  }, [isSidebarPinned])

  // ── Menu plano do mockup VOID (mesmo topo p/ todos) ────────────────
  // Sub-itens (children) só aparecem para admin / estagiário administrativo.
  const nav = useMemo(() => {
    const homeTo = isAdmin
      ? '/admin/dashboard'
      : isAdministrativeIntern
        ? '/admin/approvals'
        : '/dashboard'

    // Ferramentas extras de admin, aninhadas sob o item pai.
    const adminChildren = isAdmin
      ? {
          performance: [
            { to: '/admin/reports', label: 'Relatórios', icon: BarChart3 },
            { to: '/admin/time-entries', label: 'Apontamentos', icon: FileText },
            { to: '/admin/manage-bonuses', label: 'Bônus', icon: Gift },
            { to: '/admin/manage-expenses', label: 'Despesas', icon: Receipt },
          ],
        }
      : {}

    const items = [
      { to: homeTo, label: 'Home', icon: Home },
      { to: '/tarefas', label: 'Tarefas', icon: ListChecks },
      { to: '/projetos', label: 'Projetos', icon: FolderKanban },
      { to: '/pessoas', label: 'Pessoas', icon: Users },
      { to: '/agenda', label: 'Agenda', icon: CalendarDays },
      // Estagiário administrativo não acessa Performance.
      ...(isAdministrativeIntern
        ? []
        : [{ to: '/performance', label: 'Performance', icon: BarChart3, children: adminChildren.performance }]),
    ]

    return items
  }, [isAdmin, isAdministrativeIntern])

  const isSidebarExpanded = isSidebarPinned || isSidebarHovered

  function isItemActive(item) {
    if (location.pathname === item.to) return true
    return Boolean(item.children?.some((c) => c.to === location.pathname))
  }

  // Abre automaticamente a seção cujo sub-item está ativo.
  useEffect(() => {
    const activeParent = nav.find((item) =>
      item.children?.some((c) => c.to === location.pathname),
    )
    if (activeParent) {
      setOpenSections((cur) => (cur[activeParent.label] ? cur : { ...cur, [activeParent.label]: true }))
    }
  }, [location.pathname, nav])

  function toggleSection(label) {
    setOpenSections((current) => ({ ...current, [label]: !current[label] }))
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-bg text-text-primary">
      <aside
        onMouseEnter={() => setIsSidebarHovered(true)}
        onMouseLeave={() => setIsSidebarHovered(false)}
        className={`w-full md:h-screen md:sticky md:top-0 flex md:flex-col flex-row py-0 md:py-6 transition-[width,min-width,background-color] duration-200 ease-out ${
          isSidebarExpanded ? 'md:w-60 md:min-w-60' : 'md:w-20 md:min-w-20'
        }`}
        style={{ background: 'var(--color-sidebar)' }}
      >
        <div
          className={`hidden md:flex items-center px-3 mb-8 ${
            isSidebarExpanded ? 'justify-between' : 'justify-center gap-2'
          }`}
        >
          <div className={`flex items-center ${isSidebarExpanded ? 'gap-3 min-w-0' : ''}`}>
            <Logo size={28} color="#FFFFFF" />
            <span
              className={`text-white text-sm font-semibold tracking-wider uppercase truncate ${
                isSidebarExpanded ? 'block' : 'hidden'
              }`}
            >
              Gestão VOID
            </span>
          </div>
          {isSidebarExpanded && (
            <button
              type="button"
              onClick={() => setIsSidebarPinned((current) => !current)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-white/65 transition-colors hover:bg-white/10 hover:text-white"
              aria-pressed={isSidebarPinned}
              aria-label={isSidebarPinned ? 'Desafixar menu lateral' : 'Fixar menu lateral'}
              title={isSidebarPinned ? 'Desafixar menu' : 'Fixar menu'}
            >
              {isSidebarPinned ? <PinOff size={16} /> : <Pin size={16} />}
            </button>
          )}
        </div>

        <nav className="flex md:flex-col flex-row flex-1 md:gap-0.5 overflow-x-auto md:overflow-x-visible md:overflow-y-auto">
          {nav.map((item) => (
            <NavRow
              key={item.label}
              item={item}
              active={isItemActive(item)}
              expanded={isSidebarExpanded}
              open={Boolean(openSections[item.label])}
              onToggle={() => toggleSection(item.label)}
            />
          ))}
        </nav>

        <div
          className={`hidden md:block pt-3 mt-2 border-t border-white/10 ${
            isSidebarExpanded ? 'px-3' : 'px-2'
          }`}
        >
          <Link
            to="/profile"
            title={!isSidebarExpanded ? profile?.name || 'Usuário' : undefined}
            className={`group flex items-center rounded-xl transition-colors ${
              isSidebarExpanded
                ? 'gap-3 px-3 py-2.5 bg-white/[0.04] hover:bg-white/[0.08]'
                : 'justify-center p-2 hover:bg-white/[0.08]'
            }`}
          >
            <Avatar name={profile?.name} url={profile?.avatar_url} size={36} />
            <div className={`min-w-0 flex-1 ${isSidebarExpanded ? 'block' : 'hidden'}`}>
              <p className="text-white text-sm font-medium truncate">
                {profile?.name || 'Usuário'}
              </p>
              <p className="text-white/55 text-[11px] truncate mt-0.5">{profile?.email}</p>
            </div>
            {isSidebarExpanded && (
              <ChevronRight
                size={16}
                className="flex-none text-white/25 transition-colors group-hover:text-accent"
              />
            )}
          </Link>

          <button
            onClick={handleLogout}
            title="Sair"
            className={`mt-1 flex w-full items-center rounded-lg text-[13px] font-medium text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white ${
              isSidebarExpanded ? 'gap-2.5 px-3 py-2.5' : 'justify-center p-2.5'
            }`}
          >
            <LogOut size={16} className="flex-none" />
            <span className={isSidebarExpanded ? 'inline' : 'hidden'}>Sair</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 bg-bg text-text-primary p-4 md:p-8 overflow-x-hidden transition-colors relative">
        {/* Grafismo da marca: brilho quente + traços singulares na diagonal */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 0 }}>
          <div
            className="absolute -top-48 -right-40 h-[560px] w-[560px] rounded-full"
            style={{
              background:
                'radial-gradient(circle, color-mix(in srgb, var(--color-accent-2) 15%, transparent), transparent 70%)',
              filter: 'blur(30px)',
            }}
          />
          <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
            <line x1="0" y1="88%" x2="100%" y2="26%" stroke="var(--grafismo-a)" strokeWidth="1.25" />
            <line x1="0" y1="100%" x2="100%" y2="48%" stroke="var(--grafismo-b)" strokeWidth="1" />
          </svg>
        </div>
        <div className="relative" style={{ zIndex: 1 }}>
          <NotificationBell />
          {children}
        </div>
      </main>
      <ClockInReminder />
    </div>
  )
}
