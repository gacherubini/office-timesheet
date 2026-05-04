import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import {
  Home,
  History,
  Users,
  FolderOpen,
  Building2,
  Truck,
  Radio,
  FileText,
  LogOut,
  BarChart3,
  Receipt,
  Target,
  Sun,
  Moon,
  BriefcaseBusiness,
  CircleDollarSign,
  Sparkles,
  CalendarDays,
  ChevronDown,
  Pin,
  PinOff,
} from 'lucide-react'
import { Avatar } from './Avatar'
import { Logo } from './Logo'

function NavLinkItem({ item, active, nested = false, expanded = true }) {
  const Icon = item.icon
  const sizeClass = nested
    ? 'mx-3 md:ml-10 md:mr-4 rounded-md px-3 py-2 text-[13px]'
    : expanded
      ? 'px-4 md:px-6 py-3 text-sm'
      : 'px-4 md:px-0 py-3 text-sm md:justify-center'
  const stateClass = nested
    ? active
      ? 'bg-white/10 text-white font-medium'
      : 'text-white/55 hover:text-white hover:bg-white/5'
    : active
      ? 'text-white font-medium md:border-l-[3px] bg-white/10'
      : 'text-white/60 hover:text-white hover:bg-white/5 md:border-l-[3px] md:border-transparent'

  return (
    <Link
      to={item.to}
      className={`flex items-center gap-2.5 transition-all whitespace-nowrap ${sizeClass} ${stateClass}`}
      style={active && !nested ? { borderLeftColor: 'var(--color-accent)' } : undefined}
      title={!expanded ? item.label : undefined}
    >
      <Icon size={nested ? 16 : 18} />
      <span className={`hidden ${expanded ? 'md:inline' : 'md:hidden'}`}>{item.label}</span>
    </Link>
  )
}

function NavCategoryLink({ item, active, expanded = true }) {
  const Icon = item.icon
  const categoryClass = `mx-2 my-1.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm md:text-[12px] font-semibold md:uppercase md:tracking-wider transition-all whitespace-nowrap ${
    expanded
      ? 'md:mx-4 md:px-3.5'
      : 'md:mx-auto md:h-10 md:w-10 md:justify-center md:px-0 md:py-0'
  } ${
    active && expanded
      ? 'bg-white/12 text-white shadow-sm'
      : expanded
        ? 'bg-transparent text-white/60 hover:bg-white/8 hover:text-white'
        : 'bg-transparent text-white/60 hover:text-white'
  }`

  return (
    <div className="contents md:block">
      <Link
        to={item.to}
        title={!expanded ? item.label : undefined}
        className={categoryClass}
      >
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-md ${
            active ? 'bg-white/15 text-white' : 'bg-white/5 text-white/65'
          }`}
        >
          <Icon size={16} />
        </span>
        <span className={`hidden ${expanded ? 'md:inline' : 'md:hidden'}`}>{item.label}</span>
      </Link>
    </div>
  )
}

function NavSection({ section, pathname, open, active, expanded, onToggle }) {
  const SectionIcon = section.icon
  const highlighted = active
  const categoryClass = `mx-2 my-1.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm md:text-[12px] font-semibold md:uppercase md:tracking-wider transition-all whitespace-nowrap ${
    expanded
      ? 'md:mx-4 md:px-3.5'
      : 'md:mx-auto md:h-10 md:w-10 md:justify-center md:px-0 md:py-0'
  } ${
    highlighted && expanded
      ? 'bg-white/12 text-white shadow-sm'
      : expanded
        ? 'bg-transparent text-white/60 hover:bg-white/8 hover:text-white'
        : 'bg-transparent text-white/60 hover:text-white'
  }`

  return (
    <div className="contents md:block">
      <button
        type="button"
        onClick={onToggle}
        title={section.label}
        className={categoryClass}
      >
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-md ${
            highlighted ? 'bg-white/15 text-white' : 'bg-white/5 text-white/65'
          }`}
        >
          <SectionIcon size={16} />
        </span>
        <span className={`hidden ${expanded ? 'md:inline' : 'md:hidden'}`}>{section.label}</span>
        <ChevronDown
          size={15}
          className={`hidden ml-auto transition-transform ${
            expanded ? 'md:block' : 'md:hidden'
          } ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && expanded && (
        <>
          {section.links.map((item) => (
            <NavLinkItem
              key={item.to}
              item={item}
              active={pathname === item.to}
              expanded={expanded}
              nested
            />
          ))}
        </>
      )}
    </div>
  )
}

export function Layout({ children }) {
  const { profile, isAdmin, isAdministrativeIntern, logout } = useAuth()
  const { isDark, toggleTheme } = useTheme()
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

  const employeeHomeLink = { to: '/dashboard', label: 'Início', icon: Home }
  const adminHomeLink = { to: '/admin/dashboard', label: 'Início', icon: Home }

  const administrativeInternHomeLink = { to: '/admin/approvals', label: 'Início', icon: Home }

  const employeeSections = [
    {
      label: 'Rotina',
      icon: CalendarDays,
      links: [
        { to: '/history', label: 'Histórico', icon: History },
      ],
    },
    {
      label: 'Financeiro',
      icon: CircleDollarSign,
      links: [
        { to: '/financial-perspective', label: 'Perspectiva', icon: Target },
        { to: '/expenses', label: 'Despesas', icon: Receipt },
      ],
    },
  ]

  const adminSections = [
    {
      label: 'Operação',
      icon: Sparkles,
      links: [
        { to: '/admin/live', label: 'Painel Live', icon: Radio },
      ],
    },
    {
      label: 'Gerenciamento',
      icon: BriefcaseBusiness,
      links: [
        { to: '/admin/team', label: 'Equipe', icon: Users },
        { to: '/admin/projects', label: 'Projetos', icon: FolderOpen },
        { to: '/admin/clients', label: 'Clientes', icon: Building2 },
        { to: '/admin/suppliers', label: 'Fornecedores', icon: Truck },
      ],
    },
    {
      label: 'Financeiro',
      icon: CircleDollarSign,
      links: [
        { to: '/admin/time-entries', label: 'Apontamentos', icon: FileText },
        { to: '/admin/reports', label: 'Relatórios', icon: BarChart3 },
      ],
    },
  ]

  const administrativeInternSections = [
    {
      label: 'Operação',
      icon: Sparkles,
      links: [
        { to: '/admin/live', label: 'Painel Live', icon: Radio },
      ],
    },
    {
      label: 'Gerenciamento',
      icon: BriefcaseBusiness,
      links: [
        { to: '/admin/team', label: 'Equipe', icon: Users },
        { to: '/admin/projects', label: 'Projetos', icon: FolderOpen },
        { to: '/admin/clients', label: 'Clientes', icon: Building2 },
        { to: '/admin/suppliers', label: 'Fornecedores', icon: Truck },
      ],
    },
  ]

  const homeLink = isAdmin
    ? adminHomeLink
    : isAdministrativeIntern
      ? administrativeInternHomeLink
      : employeeHomeLink
  const sections = isAdmin
    ? adminSections
    : isAdministrativeIntern
      ? administrativeInternSections
      : employeeSections
  const isSidebarExpanded = isSidebarPinned || isSidebarHovered

  function toggleSection(label) {
    setOpenSections((current) => ({
      ...current,
      [label]: !current[label],
    }))
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
          <NavCategoryLink
            item={homeLink}
            active={location.pathname === homeLink.to}
            expanded={isSidebarExpanded}
          />

          {sections.map((section) => {
            const sectionActive = section.links.some((item) => item.to === location.pathname)

            return (
              <NavSection
                key={section.label}
                section={section}
                pathname={location.pathname}
                open={Boolean(openSections[section.label])}
                active={sectionActive}
                expanded={isSidebarExpanded}
                onToggle={() => toggleSection(section.label)}
              />
            )
          })}
        </nav>

        <div
          className={`hidden md:block pt-4 mt-2 border-t border-white/10 ${
            isSidebarExpanded ? 'px-6' : 'px-3'
          }`}
        >
          <Link
            to="/profile"
            title={!isSidebarExpanded ? profile?.name || 'Usuário' : undefined}
            className={`flex items-center group ${
              isSidebarExpanded ? 'gap-3' : 'justify-center'
            }`}
          >
            <Avatar name={profile?.name} url={profile?.avatar_url} size={36} />
            <div className={`min-w-0 flex-1 ${isSidebarExpanded ? 'block' : 'hidden'}`}>
              <p className="text-white text-sm font-medium truncate">
                {profile?.name || 'Usuário'}
              </p>
              <p className="text-white/60 text-[11px] truncate">{profile?.email}</p>
            </div>
          </Link>

          <div
            className={`flex items-center mt-3 ${
              isSidebarExpanded ? 'gap-3' : 'justify-center gap-2'
            }`}
          >
            <button
              onClick={toggleTheme}
              className="flex items-center gap-2 text-white/60 hover:text-white text-[13px] transition-colors"
              aria-label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
              title={isDark ? 'Tema claro' : 'Tema escuro'}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
              <span className={isSidebarExpanded ? 'inline' : 'hidden'}>
                {isDark ? 'Claro' : 'Escuro'}
              </span>
            </button>
            <button
              onClick={handleLogout}
              className={`flex items-center gap-2 text-white/60 hover:text-white text-[13px] transition-colors ${
                isSidebarExpanded ? 'ml-auto' : ''
              }`}
              title="Sair"
            >
              <LogOut size={16} />
              <span className={isSidebarExpanded ? 'inline' : 'hidden'}>Sair</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 bg-bg text-text-primary p-4 md:p-8 overflow-x-hidden transition-colors">
        {children}
      </main>
    </div>
  )
}
