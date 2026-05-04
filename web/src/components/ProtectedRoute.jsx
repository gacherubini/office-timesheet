import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function ProtectedRoute({
  children,
  adminOnly = false,
  approverOnly = false,
  disallowAdministrativeIntern = false,
}) {
  const { profile, isAdmin, isAdministrativeIntern, canApproveRequests, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    )
  }

  if (!profile) return <Navigate to="/login" replace />
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />
  if (approverOnly && !canApproveRequests) return <Navigate to="/" replace />
  if (disallowAdministrativeIntern && isAdministrativeIntern) return <Navigate to="/" replace />

  return children
}
