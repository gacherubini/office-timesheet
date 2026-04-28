import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { api } from '../lib/api'

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Clock className="text-gray-900" size={32} />
          <h1 className="text-2xl font-bold text-gray-900">Timesheet</h1>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
          {submitted ? (
            <div className="text-center space-y-3">
              <p className="text-sm text-gray-700">
                Se o e-mail <strong>{email}</strong> estiver cadastrado, você receberá um link para redefinir sua senha.
              </p>
              <Link to="/login" className="block text-sm text-gray-500 hover:text-gray-700 underline">
                Voltar ao login
              </Link>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Esqueceu a senha?</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Informe seu e-mail e enviaremos um link de redefinição.
                </p>
              </div>

              {error && (
                <div className="bg-red-50 text-red-700 text-sm rounded-md p-3">{error}</div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
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

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gray-900 text-white rounded-md py-2 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Enviando...' : 'Enviar link'}
                </button>
              </form>

              <Link to="/login" className="block text-center text-sm text-gray-500 hover:text-gray-700">
                Voltar ao login
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
