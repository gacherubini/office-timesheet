import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Home, History, Users, FolderOpen, Radio, FileText, LogOut, BarChart3, User } from 'lucide-react'
import { Avatar } from './Avatar'

export function Layout({ children }) {
  const { profile, isAdmin, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const employeeLinks = [
    { to: '/dashboard', label: 'Início', icon: Home },
    { to: '/history', label: 'Histórico', icon: History },
  ]

  const adminLinks = [
    { to: '/admin/dashboard', label: 'Início', icon: Home },
    { to: '/admin/live', label: 'Painel Live', icon: Radio },
    { to: '/admin/team', label: 'Equipe', icon: Users },
    { to: '/admin/projects', label: 'Projetos', icon: FolderOpen },
    { to: '/admin/time-entries', label: 'Apontamentos', icon: FileText },
    { to: '/admin/reports', label: 'Relatórios', icon: BarChart3 },
  ]

  const links = isAdmin ? adminLinks : employeeLinks
  const menuLinks = [...links, { to: '/profile', label: 'Perfil', icon: User }]

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-60 bg-gray-900 text-white flex md:flex-col flex-row md:h-screen md:sticky md:top-0">
        <div className="p-4 font-bold text-lg hidden md:block border-b border-gray-700">
          Timesheet
        </div>

        <nav className="flex md:flex-col flex-row flex-1 overflow-x-auto md:overflow-x-visible md:overflow-y-auto">
          {menuLinks.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-2 px-4 py-3 text-sm transition-colors hover:bg-gray-800 ${
                location.pathname === to ? 'bg-gray-800 text-white' : 'text-gray-400'
              }`}
            >
              <Icon size={18} />
              <span className="hidden md:inline">{label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-700 hidden md:block">
          <Link to="/profile" className="flex items-center gap-2 mb-1 group">
            <Avatar name={profile?.name} url={profile?.avatar_url} size={32} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-300 truncate group-hover:text-white transition-colors">{profile?.name}</p>
              <p className="text-xs text-gray-500 truncate">{profile?.email}</p>
            </div>
          </Link>
          <button
            onClick={handleLogout}
            className="mt-2 flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <LogOut size={14} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  )
}
