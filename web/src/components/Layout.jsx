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
  User,
  Receipt,
  Sun,
  Moon,
} from 'lucide-react'
import { Avatar } from './Avatar'
import { Logo } from './Logo'

export function Layout({ children }) {
  const { profile, isAdmin, logout } = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const employeeLinks = [
    { to: '/dashboard', label: 'Início', icon: Home },
    { to: '/history', label: 'Histórico', icon: History },
    { to: '/expenses', label: 'Despesas', icon: Receipt },
  ]

  const adminLinks = [
    { to: '/admin/dashboard', label: 'Início', icon: Home },
    { to: '/admin/live', label: 'Painel Live', icon: Radio },
    { to: '/admin/team', label: 'Equipe', icon: Users },
    { to: '/admin/projects', label: 'Projetos', icon: FolderOpen },
    { to: '/admin/clients', label: 'Clientes', icon: Building2 },
    { to: '/admin/suppliers', label: 'Fornecedores', icon: Truck },
    { to: '/admin/time-entries', label: 'Apontamentos', icon: FileText },
    { to: '/admin/reports', label: 'Relatórios', icon: BarChart3 },
  ]

  const links = isAdmin ? adminLinks : employeeLinks
  const menuLinks = [...links, { to: '/profile', label: 'Perfil', icon: User }]

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
          {menuLinks.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-4 md:px-6 py-3 text-sm transition-all whitespace-nowrap ${
                  active
                    ? 'text-white font-medium md:border-l-[3px] bg-white/10'
                    : 'text-white/60 hover:text-white hover:bg-white/5 md:border-l-[3px] md:border-transparent'
                }`}
                style={active ? { borderLeftColor: 'var(--color-accent)' } : undefined}
              >
                <Icon size={18} />
                <span className="hidden md:inline">{label}</span>
              </Link>
            )
          })}
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
