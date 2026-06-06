import { useEffect, useState } from 'react'
import { CalendarClock, Link2, Check, Unlink, HelpCircle, ChevronDown, ExternalLink } from 'lucide-react'
import { getCalendarStatus, connectCalendar, disconnectCalendar } from '../../lib/calendarClient'

// Conecta a agenda Google via "endereço secreto no formato iCal".
// `onChange` é chamado após conectar/desconectar (pra quem embute em outra tela).
// `hideWhenConnected`: não renderiza nada quando já conectado (usado na Agenda).
export function CalendarConnect({ onChange, hideWhenConnected = false }) {
  const [connected, setConnected] = useState(false)
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    getCalendarStatus()
      .then((s) => setConnected(Boolean(s.connected)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleConnect(e) {
    e.preventDefault()
    setError(''); setSuccess(''); setBusy(true)
    try {
      await connectCalendar(url.trim())
      setConnected(true)
      setUrl('')
      setSuccess('Agenda conectada! Seus eventos já aparecem em Agenda.')
      onChange?.(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    setError(''); setSuccess(''); setBusy(true)
    try {
      await disconnectCalendar()
      setConnected(false)
      onChange?.(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Já conectado e o pai pediu pra esconder → não mostra nada.
  if (hideWhenConnected && !loading && connected) return null

  return (
    <div className="bg-surface rounded-xl border border-border-subtle shadow-card overflow-hidden">
      <div className="p-5 border-b border-border-subtle flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[color:var(--color-accent)]/15 text-accent flex items-center justify-center">
          <CalendarClock size={18} />
        </div>
        <div>
          <h2 className="font-semibold text-text-primary">Minha agenda Google</h2>
          <p className="text-sm text-text-secondary">Veja seus eventos do Google dentro do sistema.</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {error && <div className="rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm p-3">{error}</div>}
        {success && <div className="rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm p-3">{success}</div>}

        {loading ? (
          <p className="text-sm text-text-secondary">Carregando...</p>
        ) : connected ? (
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
              <Check size={16} /> Agenda conectada.
            </span>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-rose-500 disabled:opacity-50 transition-colors"
            >
              <Unlink size={15} /> {busy ? 'Desconectando...' : 'Desconectar'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleConnect} className="space-y-3">
            <div className="flex gap-2">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                className="flex-1 form-control rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
                required
              />
              <button
                type="submit"
                disabled={busy || !url.trim()}
                className="inline-flex items-center gap-1.5 text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap"
                style={{ background: 'var(--color-accent)' }}
              >
                <Link2 size={15} /> {busy ? 'Conectando...' : 'Conectar'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowHelp((s) => !s)}
              className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              <HelpCircle size={13} /> Como conectar?
              <ChevronDown size={13} className={`transition-transform ${showHelp ? 'rotate-180' : ''}`} />
            </button>

            {showHelp && (
              <div className="border-l-2 border-border-subtle ml-1 pl-3 pt-1 space-y-2">
                <ol className="text-[13px] text-text-secondary list-decimal pl-4 space-y-1">
                  <li>
                    No <span className="text-text-primary">computador</span>, abra o{' '}
                    <a href="https://calendar.google.com" target="_blank" rel="noreferrer" className="text-accent hover:underline">Google Calendar</a>{' '}
                    (o app do celular não mostra esse link).
                  </li>
                  <li>
                    Na coluna da esquerda, em <span className="text-text-primary">Minhas agendas</span>, passe o mouse no nome da
                    sua agenda → clique nos <span className="text-text-primary">três pontinhos ⋮</span> →{' '}
                    <span className="text-text-primary">Configurações e compartilhamento</span>.
                  </li>
                  <li>Role até a seção <span className="text-text-primary">Integrar agenda</span>.</li>
                  <li>
                    Copie o <span className="text-text-primary">Endereço secreto no formato iCal</span>{' '}
                    (termina em <code className="text-text-primary">basic.ics</code>) e cole acima.
                  </li>
                </ol>
                <a
                  href="https://support.google.com/calendar/answer/37648?hl=pt-BR"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline"
                >
                  <ExternalLink size={12} /> Ver o passo a passo com prints (ajuda do Google)
                </a>
                <p className="text-[11px] text-text-secondary">
                  Conta da empresa (Workspace)? O endereço secreto pode estar bloqueado pelo administrador.
                </p>
              </div>
            )}

            <p className="text-[11px] text-text-secondary">
              O link é guardado cifrado e dá acesso só de leitura. Você pode desconectar quando quiser.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
