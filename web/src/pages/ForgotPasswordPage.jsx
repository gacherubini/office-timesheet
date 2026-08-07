import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { Logo } from '../components/Logo'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await api.post('/auth/forgot-password', { email })
      setSubmitted(true)
    } catch (err) {
      setError(err.message || 'Erro ao enviar o e-mail.')
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

        <div className="bg-surface border border-border-subtle p-6 space-y-4">
          {submitted ? (
            <div className="text-center space-y-3">
              <p className="text-sm text-text-primary">
                Se o e-mail <strong>{email}</strong> estiver cadastrado, você receberá um link para redefinir sua senha.
              </p>
              <Link to="/login" className="block text-sm text-text-secondary hover:text-text-primary underline transition-colors">
                Voltar ao login
              </Link>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-base font-semibold text-text-primary">Esqueceu a senha?</h2>
                <p className="text-sm text-text-secondary mt-1">
                  Informe seu e-mail e enviaremos um link de redefinição.
                </p>
              </div>

              {error && (
                <div className="bg-rose-500/10 text-rose-600 text-sm rounded-lg p-3">{error}</div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-1">
                    E-mail
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full form-control rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
                    placeholder="seu@email.com"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full text-white rounded-lg py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: 'var(--color-accent)' }}
                >
                  {loading ? 'Enviando...' : 'Enviar link'}
                </button>
              </form>

              <Link to="/login" className="block text-center text-sm text-text-secondary hover:text-text-primary transition-colors">
                Voltar ao login
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
