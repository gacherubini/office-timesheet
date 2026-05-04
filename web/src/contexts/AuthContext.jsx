import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../lib/api'
import {
  canAccessMoneyRole,
  canApproveRequestsRole,
  isAdministrativeInternRole,
  isAdminRole,
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
  const canApproveRequests = canApproveRequestsRole(profile?.role)
  const canAccessAdminArea = isAdmin || isAdministrativeIntern
  const canAccessMoney = canAccessMoneyRole(profile?.role)

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isAdmin,
        isAdministrativeIntern,
        canApproveRequests,
        canAccessAdminArea,
        canAccessMoney,
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
