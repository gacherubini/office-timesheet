import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { TimerPage } from './pages/TimerPage'
import { HistoryPage } from './pages/HistoryPage'
import { AdminLivePage } from './pages/admin/AdminLivePage'
import { AdminTeamPage } from './pages/admin/AdminTeamPage'
import { AdminProjectsPage } from './pages/admin/AdminProjectsPage'
import { AdminTimeEntriesPage } from './pages/admin/AdminTimeEntriesPage'
import { AdminReportsPage } from './pages/admin/AdminReportsPage'

export default function App() {
  const { loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Rotas do colaborador */}
      <Route path="/" element={<ProtectedRoute><Layout><TimerPage /></Layout></ProtectedRoute>} />
      <Route path="/history" element={<ProtectedRoute><Layout><HistoryPage /></Layout></ProtectedRoute>} />

      {/* Rotas do admin */}
      <Route path="/admin/live" element={<ProtectedRoute adminOnly><Layout><AdminLivePage /></Layout></ProtectedRoute>} />
      <Route path="/admin/team" element={<ProtectedRoute adminOnly><Layout><AdminTeamPage /></Layout></ProtectedRoute>} />
      <Route path="/admin/projects" element={<ProtectedRoute adminOnly><Layout><AdminProjectsPage /></Layout></ProtectedRoute>} />
      <Route path="/admin/time-entries" element={<ProtectedRoute adminOnly><Layout><AdminTimeEntriesPage /></Layout></ProtectedRoute>} />
      <Route path="/admin/reports" element={<ProtectedRoute adminOnly><Layout><AdminReportsPage /></Layout></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
