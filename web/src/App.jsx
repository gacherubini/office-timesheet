import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { TimerPage } from './pages/TimerPage'
import { HistoryPage } from './pages/HistoryPage'
import { ProjectBoardPage } from './pages/ProjectBoardPage'
import { ExpensesPage } from './pages/ExpensesPage'
import { VacationsPage } from './pages/VacationsPage'
import { VacationCalendarPage } from './pages/VacationCalendarPage'
import { AgendaPage } from './pages/AgendaPage'
import { ProfilePage } from './pages/ProfilePage'
import { EmployeeDashboardPage } from './pages/EmployeeDashboardPage'
import { GlobalTasksPage } from './pages/GlobalTasksPage'
import { PessoasPage } from './pages/PessoasPage'
import { PerformancePage } from './pages/PerformancePage'
import { AdminLivePage } from './pages/admin/AdminLivePage'
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage'
import { AdminDeletedUsersPage } from './pages/admin/AdminDeletedUsersPage'
import { AdminDeletedProjectsPage } from './pages/admin/AdminDeletedProjectsPage'
import { AdminClientsPage } from './pages/admin/AdminClientsPage'
import { AdminSuppliersPage } from './pages/admin/AdminSuppliersPage'
import { AdminTimeEntriesPage } from './pages/admin/AdminTimeEntriesPage'
import { AdminReportsPage } from './pages/admin/AdminReportsPage'
import { AdminApprovalsPage } from './pages/admin/AdminApprovalsPage'
import { AdminManageExpensesPage } from './pages/admin/AdminManageExpensesPage'
import { AdminManageBonusesPage } from './pages/admin/AdminManageBonusesPage'

function HomeRedirect() {
  const { isAdmin, isAdministrativeIntern } = useAuth()
  if (isAdmin) return <Navigate to="/admin/dashboard" replace />
  if (isAdministrativeIntern) return <Navigate to="/admin/approvals" replace />
  return <Navigate to="/dashboard" replace />
}

export default function App() {
  const { loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Rotas do colaborador */}
      <Route path="/" element={<ProtectedRoute><HomeRedirect /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute disallowAdministrativeIntern><Layout><EmployeeDashboardPage /></Layout></ProtectedRoute>} />
      <Route path="/timer" element={<ProtectedRoute><Layout><TimerPage /></Layout></ProtectedRoute>} />
      <Route path="/financial-perspective" element={<ProtectedRoute disallowAdministrativeIntern><Layout><PerformancePage /></Layout></ProtectedRoute>} />
      <Route path="/history" element={<ProtectedRoute><Layout><HistoryPage /></Layout></ProtectedRoute>} />
      <Route path="/project-board" element={<ProtectedRoute><Layout><ProjectBoardPage /></Layout></ProtectedRoute>} />
      <Route path="/expenses" element={<ProtectedRoute disallowAdministrativeIntern><Layout><ExpensesPage /></Layout></ProtectedRoute>} />
      <Route path="/vacations" element={<ProtectedRoute><Layout><VacationsPage /></Layout></ProtectedRoute>} />
      <Route path="/vacation-calendar" element={<ProtectedRoute><Layout><VacationCalendarPage /></Layout></ProtectedRoute>} />
      <Route path="/clients" element={<ProtectedRoute><Layout><AdminClientsPage /></Layout></ProtectedRoute>} />
      <Route path="/suppliers" element={<ProtectedRoute><Layout><AdminSuppliersPage /></Layout></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Layout><ProfilePage /></Layout></ProtectedRoute>} />

      {/* Nova navegação VOID — rotas em português apontando para as páginas atuais.
          As rotas antigas acima continuam vivas para não quebrar deep-links. */}
      <Route path="/tarefas" element={<ProtectedRoute><Layout><GlobalTasksPage /></Layout></ProtectedRoute>} />
      <Route path="/projetos" element={<ProtectedRoute><Layout><ProjectBoardPage /></Layout></ProtectedRoute>} />
      <Route path="/pessoas" element={<ProtectedRoute><Layout><PessoasPage /></Layout></ProtectedRoute>} />
      <Route path="/agenda" element={<ProtectedRoute><Layout><AgendaPage /></Layout></ProtectedRoute>} />
      <Route path="/performance" element={<ProtectedRoute disallowAdministrativeIntern><Layout><PerformancePage /></Layout></ProtectedRoute>} />

      {/* Rotas do admin */}
      <Route path="/admin/approvals" element={<ProtectedRoute approverOnly><Layout><AdminApprovalsPage /></Layout></ProtectedRoute>} />
      <Route path="/admin/dashboard" element={<ProtectedRoute adminOnly><Layout><AdminDashboardPage /></Layout></ProtectedRoute>} />
      <Route path="/admin/live" element={<ProtectedRoute approverOnly><Layout><AdminLivePage /></Layout></ProtectedRoute>} />
      <Route path="/admin/deleted-users" element={<ProtectedRoute adminOnly><Layout><AdminDeletedUsersPage /></Layout></ProtectedRoute>} />
      <Route path="/admin/deleted-projects" element={<ProtectedRoute adminOnly><Layout><AdminDeletedProjectsPage /></Layout></ProtectedRoute>} />
      <Route path="/admin/clients" element={<ProtectedRoute approverOnly><Layout><AdminClientsPage /></Layout></ProtectedRoute>} />
      <Route path="/admin/suppliers" element={<ProtectedRoute approverOnly><Layout><AdminSuppliersPage /></Layout></ProtectedRoute>} />
      <Route path="/admin/time-entries" element={<ProtectedRoute adminOnly><Layout><AdminTimeEntriesPage /></Layout></ProtectedRoute>} />
      <Route path="/admin/reports" element={<ProtectedRoute adminOnly><Layout><AdminReportsPage /></Layout></ProtectedRoute>} />
      <Route path="/admin/manage-expenses" element={<ProtectedRoute adminOnly><Layout><AdminManageExpensesPage /></Layout></ProtectedRoute>} />
      <Route path="/admin/manage-bonuses" element={<ProtectedRoute adminOnly><Layout><AdminManageBonusesPage /></Layout></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
