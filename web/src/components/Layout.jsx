import { useState } from 'react'
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
} from 'lucide-react'
import { Avatar } from './Avatar'
import { Logo } from './Logo'

function NavLinkItem({ item, active, nested = false }) {
  const Icon = item.icon
  const sizeClass = nested
    ? 'mx-3 md:ml-10 md:mr-4 rounded-md px-3 py-2 text-[13px]'
    : 'px-4 md:px-6 py-3 text-sm'
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
    >
      <Icon size={nested ? 16 : 18} />
      <span className="hidden md:inline">{item.label}</span>
    </Link>
  )
}

function NavCategoryLink({ item, active }) {
  const Icon = item.icon

  return (
    <Link
      to={item.to}
      className={`mx-2 md:mx-4 my-1.5 flex items-center gap-3 rounded-lg px-3 md:px-3.5 py-2.5 text-sm md:text-[12px] font-semibold md:uppercase md:tracking-wider transition-all whitespace-nowrap ${
        active
          ? 'bg-white/12 text-white shadow-sm'
          : 'bg-transparent text-white/60 hover:bg-white/8 hover:text-white'
      }`}
    >
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-md ${
          active ? 'bg-white/15 text-white' : 'bg-white/5 text-white/65'
        }`}
      >
        <Icon size={16} />
      </span>
      <span className="hidden md:inline">{item.label}</span>
    </Link>
  )
}

function NavSection({ section, pathname, open, onToggle }) {
  const SectionIcon = section.icon

  return (
    <div className="contents md:block">
      <button
        type="button"
        onClick={onToggle}
        title={section.label}
        className={`mx-2 md:mx-4 my-1.5 flex items-center gap-3 rounded-lg px-3 md:px-3.5 py-2.5 text-sm md:text-[12px] font-semibold md:uppercase md:tracking-wider transition-all whitespace-nowrap ${
          open
            ? 'bg-white/12 text-white shadow-sm'
            : 'bg-transparent text-white/60 hover:bg-white/8 hover:text-white'
        }`}
      >
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-md ${
            open ? 'bg-white/15 text-white' : 'bg-white/5 text-white/65'
          }`}
        >
          <SectionIcon size={16} />
        </span>
        <span className="hidden md:inline">{section.label}</span>
        <ChevronDown
          size={15}
          className={`hidden md:block ml-auto transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <>
          {section.links.map((item) => (
            <NavLinkItem key={item.to} item={item} active={pathname === item.to} nested />
          ))}
        </>
      )}
    </div>
  )
}

export function Layout({ children }) {
  const { profile, isAdmin, logout } = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const [openSections, setOpenSections] = useState({})

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const employeeHomeLink = { to: '/dashboard', label: 'Início', icon: Home }
  const adminHomeLink = { to: '/admin/dashboard', label: 'Início', icon: Home }

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

  const homeLink = isAdmin ? adminHomeLink : employeeHomeLink
  const sections = isAdmin ? adminSections : employeeSections

  function toggleSection(label) {
    setOpenSections((current) => ({
      ...current,
      [label]: !current[label],
    }))
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-bg text-text-primary">
      <aside
        className="w-full md:w-60 md:min-w-60 md:h-screen md:sticky md:top-0 flex md:flex-col flex-row py-0 md:py-6 transition-colors"
        style={{ background: 'var(--color-sidebar)' }}
      >
        <div className="hidden md:flex items-center gap-3 px-6 mb-10">
          <Logo size={28} color="#FFFFFF" />
          <span className="text-white text-sm font-semibold tracking-wider uppercase">
            Gestão VOID
          </span>
        </div>

        <nav className="flex md:flex-col flex-row flex-1 md:gap-0.5 overflow-x-auto md:overflow-x-visible md:overflow-y-auto">
          <NavCategoryLink item={homeLink} active={location.pathname === homeLink.to} />

          {sections.map((section) => (
            <NavSection
              key={section.label}
              section={section}
              pathname={location.pathname}
              open={Boolean(openSections[section.label])}
              onToggle={() => toggleSection(section.label)}
            />
          ))}
        </nav>

        <div className="hidden md:block px-6 pt-4 mt-2 border-t border-white/10">
          <Link to="/profile" className="flex items-center gap-3 group">
            <Avatar name={profile?.name} url={profile?.avatar_url} size={36} />
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-medium truncate">
                {profile?.name || 'Usuário'}
              </p>
              <p className="text-white/60 text-[11px] truncate">{profile?.email}</p>
            </div>
          </Link>

          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={toggleTheme}
              className="flex items-center gap-2 text-white/60 hover:text-white text-[13px] transition-colors"
              aria-label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
              <span>{isDark ? 'Claro' : 'Escuro'}</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-white/60 hover:text-white text-[13px] transition-colors ml-auto"
            >
              <LogOut size={16} />
              Sair
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
