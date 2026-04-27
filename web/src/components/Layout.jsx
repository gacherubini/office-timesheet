import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Clock, History, Users, FolderOpen, Radio, FileText, LogOut, BarChart3 } from 'lucide-react'

export function Layout({ children }) {
  const { profile, isAdmin, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const employeeLinks = [
    { to: '/', label: 'Cronômetro', icon: Clock },
    { to: '/history', label: 'Histórico', icon: History },
  ]

  const adminLinks = [
    { to: '/admin/live', label: 'Painel Live', icon: Radio },
    { to: '/admin/team', label: 'Equipe', icon: Users },
    { to: '/admin/projects', label: 'Projetos', icon: FolderOpen },
    { to: '/admin/time-entries', label: 'Apontamentos', icon: FileText },
    { to: '/admin/reports', label: 'Relatórios', icon: BarChart3 },
  ]

  const links = isAdmin ? [...employeeLinks, ...adminLinks] : employeeLinks

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-60 bg-gray-900 text-white flex md:flex-col flex-row md:min-h-screen">
        <div className="p-4 font-bold text-lg hidden md:block border-b border-gray-700">
          Timesheet
        </div>

        <nav className="flex md:flex-col flex-row flex-1 overflow-x-auto md:overflow-x-visible">
          {links.map(({ to, label, icon: Icon }) => (
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
          <p className="text-sm text-gray-400 truncate">{profile?.name}</p>
          <p className="text-xs text-gray-500 truncate">{profile?.email}</p>
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
