import { useState } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Clock } from 'lucide-react'

export function LoginPage() {
  const { profile, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (profile) return <Navigate to="/" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      setError(err.message || 'Erro ao fazer login.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Clock className="text-gray-900" size={32} />
          <h1 className="text-2xl font-bold text-gray-900">Timesheet</h1>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm rounded-md p-3">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              placeholder="seu@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Senha
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              placeholder="******"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white rounded-md py-2 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>

          <Link
            to="/forgot-password"
            className="block text-center text-sm text-gray-500 hover:text-gray-700"
          >
            Esqueceu a senha?
          </Link>
        </form>
      </div>
    </div>
  )
}
