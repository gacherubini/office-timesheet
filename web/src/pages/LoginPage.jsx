import { useState } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { BrandLine } from '../components/BrandLine'
import simbolo from '../assets/studio-vivian-simbolo.png'

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
    <div className="min-h-screen grid lg:grid-cols-2 bg-bg text-text-primary">
      {/* Painel do "vazio" — símbolo + Gestão VOID */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-green-dk p-12 text-white">
        <BrandLine x1={-5} y1={82} x2={105} y2={16} opacity={0.28} />

        <div className="relative z-10 flex items-center gap-2.5">
          <img src={simbolo} alt="Studio Vivian" className="h-5 w-auto invert" />
          <span className="text-[13px] font-light tracking-wide text-white/85">Gestão VOID</span>
        </div>

        <p className="relative z-10 font-display text-[42px] leading-[1.12] max-w-[15ch] font-medium">
          Tudo começa no{' '}
          <span className="font-serif italic" style={{ color: 'var(--color-orange)' }}>
            vazio fértil.
          </span>
        </p>

        <p className="relative z-10 text-[11px] tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.6)' }}>
          STUDIO VIVIAN · ARQUITETURA
        </p>
      </div>

      {/* Formulário */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-10 flex items-center justify-center gap-2.5">
            <img src={simbolo} alt="Studio Vivian" className="h-5 w-auto" />
            <span className="text-[13px] font-light tracking-wide text-text-secondary">Gestão VOID</span>
          </div>

          <h1 className="font-display text-3xl leading-tight text-text-primary">
            Bem-vindo de volta
            <span className="font-serif italic text-[color:var(--color-accent)]">.</span>
          </h1>

          {error && (
            <div className="state-danger-soft text-sm p-3 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-text-secondary mb-1.5">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full form-control border px-3 py-2.5 text-sm outline-none transition-colors"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium text-text-secondary mb-1.5">
                Senha
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full form-control border px-3 py-2.5 text-sm outline-none transition-colors"
                placeholder="••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full text-white py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'var(--color-accent)' }}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>

            <Link
              to="/forgot-password"
              className="block text-center text-sm text-text-secondary hover:text-[color:var(--color-accent)] transition-colors pt-1"
            >
              Esqueceu a senha?
            </Link>
          </form>
        </div>
      </div>
    </div>
  )
}
