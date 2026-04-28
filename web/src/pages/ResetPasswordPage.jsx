import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { api } from '../lib/api'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [accessToken, setAccessToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [invalidLink, setInvalidLink] = useState(false)

  useEffect(() => {
    const hash = window.location.hash
    const params = new URLSearchParams(hash.replace('#', ''))
    const token = params.get('access_token')
    const type = params.get('type')

    if (!token || type !== 'recovery') {
      setInvalidLink(true)
      return
    }

    setAccessToken(token)
    // Limpa o hash da URL sem recarregar
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (newPassword !== confirm) {
      setError('As senhas não coincidem.')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/reset-password', { accessToken, newPassword })
      setDone(true)
    } catch (err) {
      setError(err.message || 'Erro ao redefinir a senha.')
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

        <div className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
          {invalidLink && (
            <div className="text-center space-y-3">
              <p className="text-sm text-red-600">Link inválido ou expirado.</p>
              <Link to="/forgot-password" className="block text-sm text-gray-500 hover:text-gray-700 underline">
                Solicitar novo link
              </Link>
            </div>
          )}

          {done && (
            <div className="text-center space-y-3">
              <p className="text-sm text-gray-700">Senha redefinida com sucesso!</p>
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-gray-900 text-white rounded-md py-2 text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                Ir para o login
              </button>
            </div>
          )}

          {!invalidLink && !done && (
            <>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Nova senha</h2>
                <p className="text-sm text-gray-500 mt-1">Escolha uma nova senha para sua conta.</p>
              </div>

              {error && (
                <div className="bg-red-50 text-red-700 text-sm rounded-md p-3">{error}</div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    Nova senha
                  </label>
                  <input
                    id="newPassword"
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>

                <div>
                  <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1">
                    Confirmar senha
                  </label>
                  <input
                    id="confirm"
                    type="password"
                    required
                    minLength={6}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    placeholder="Repita a senha"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gray-900 text-white rounded-md py-2 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Salvando...' : 'Redefinir senha'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
