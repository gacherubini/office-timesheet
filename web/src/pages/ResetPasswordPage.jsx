import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../lib/api'
import { Logo } from '../components/Logo'

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
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')

    if (!token) {
      setInvalidLink(true)
      return
    }

    setAccessToken(token)
    // Limpa a query string da URL sem recarregar
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
      await api.post('/auth/reset-password', { token: accessToken, newPassword })
      setDone(true)
    } catch (err) {
      setError(err.message || 'Erro ao redefinir a senha.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg text-text-primary px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Logo size={32} />
          <h1 className="text-2xl font-bold text-text-primary">Gestão VOID</h1>
        </div>

        <div className="bg-surface rounded-xl shadow-card border border-border-subtle p-6 space-y-4">
          {invalidLink && (
            <div className="text-center space-y-3">
              <p className="text-sm text-rose-600">Link inválido ou expirado.</p>
              <Link to="/forgot-password" className="block text-sm text-text-secondary hover:text-text-primary underline transition-colors">
                Solicitar novo link
              </Link>
            </div>
          )}

          {done && (
            <div className="text-center space-y-3">
              <p className="text-sm text-text-primary">Senha redefinida com sucesso!</p>
              <button
                onClick={() => navigate('/login')}
                className="w-full text-white rounded-lg py-2 text-sm font-medium hover:opacity-90 transition-opacity"
                style={{ background: 'var(--color-accent)' }}
              >
                Ir para o login
              </button>
            </div>
          )}

          {!invalidLink && !done && (
            <>
              <div>
                <h2 className="text-base font-semibold text-text-primary">Nova senha</h2>
                <p className="text-sm text-text-secondary mt-1">Escolha uma nova senha para sua conta.</p>
              </div>

              {error && (
                <div className="bg-rose-500/10 text-rose-600 text-sm rounded-lg p-3">{error}</div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-text-secondary mb-1">
                    Nova senha
                  </label>
                  <input
                    id="newPassword"
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full form-control rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>

                <div>
                  <label htmlFor="confirm" className="block text-sm font-medium text-text-secondary mb-1">
                    Confirmar senha
                  </label>
                  <input
                    id="confirm"
                    type="password"
                    required
                    minLength={6}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full form-control rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
                    placeholder="Repita a senha"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full text-white rounded-lg py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: 'var(--color-accent)' }}
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
