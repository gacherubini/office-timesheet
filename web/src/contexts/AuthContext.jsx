import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../lib/api'
import {
  canAccessAdminAreaRole,
  canAutoApproveOwnVacationRequestRole,
  canAccessMoneyRole,
  canApproveRequestsRole,
  canDeleteClientsRole,
  canDeleteSuppliersRole,
  canManageClientsRole,
  canManageSuppliersRole,
  canManageProjectsRole,
  isAdministrativeInternRole,
  isAdminRole,
  isProjectManagerRole,
} from '../lib/permissions'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (token) {
      api.get('/me')
        .then((data) => {
          setUser(data.user)
          setProfile(data.profile)
        })
        .catch(() => {
          localStorage.removeItem('access_token')
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  async function login(email, password) {
    const data = await api.post('/auth/login', { email, password })
    localStorage.setItem('access_token', data.access_token)

    const me = await api.get('/me')
    setUser(me.user)
    setProfile(me.profile)

    return me.profile
  }

  function logout() {
    localStorage.removeItem('access_token')
    setUser(null)
    setProfile(null)
  }

  function updateProfile(nextProfile) {
    setProfile(nextProfile)
  }

  const isAdmin = isAdminRole(profile?.role)
  const isAdministrativeIntern = isAdministrativeInternRole(profile?.role)
  const isProjectManager = isProjectManagerRole(profile?.role)
  const canManageProjects = canManageProjectsRole(profile?.role)
  const canApproveRequests = canApproveRequestsRole(profile?.role)
  const canAccessAdminArea = canAccessAdminAreaRole(profile?.role)
  const canAccessMoney = canAccessMoneyRole(profile?.role)
  const canManageClients = canManageClientsRole(profile?.role)
  const canDeleteClients = canDeleteClientsRole(profile?.role)
  const canManageSuppliers = canManageSuppliersRole(profile?.role)
  const canDeleteSuppliers = canDeleteSuppliersRole(profile?.role)
  const canAutoApproveOwnVacationRequest = canAutoApproveOwnVacationRequestRole(profile?.role)

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isAdmin,
        isAdministrativeIntern,
        isProjectManager,
        canManageProjects,
        canApproveRequests,
        canAccessAdminArea,
        canAccessMoney,
        canManageClients,
        canDeleteClients,
        canManageSuppliers,
        canDeleteSuppliers,
        canAutoApproveOwnVacationRequest,
        loading,
        login,
        logout,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return context
}
