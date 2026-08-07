import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Check } from 'lucide-react'
import { api } from '../lib/api'
import { openNotificationStream } from '../lib/notificationsClient'
import { Avatar } from './Avatar'
import { notificationText, relativeTime } from '../pages/projectBoard/helpers'

export function NotificationBell() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  async function loadInitial() {
    try {
      const [list, count] = await Promise.all([
        api.get('/notifications'),
        api.get('/notifications/unread-count'),
      ])
      setItems(list)
      setUnread(count.count)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    loadInitial()
    const es = openNotificationStream((notif) => {
      setItems((prev) => [notif, ...prev].slice(0, 50))
      if (!notif.read_at) setUnread((u) => u + 1)
    })
    return () => es?.close()
  }, [])

  useEffect(() => {
    if (!open) return
    function onClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function handleClickItem(n) {
    setOpen(false)
    if (!n.read_at) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)))
      setUnread((u) => Math.max(0, u - 1))
      api.put(`/notifications/${n.id}/read`).catch(() => {})
    }
    if (n.type === 'time_entry_started' || n.type === 'time_entry_stopped') navigate('/admin/live')
    else if (n.task_id) navigate(`/project-board?task=${n.task_id}`)
  }

  async function markAllRead() {
    setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at || new Date().toISOString() })))
    setUnread(0)
    api.post('/notifications/read-all').catch(() => {})
  }

  const hasUnread = unread > 0

  return (
    <div ref={wrapRef} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Notificações"
        aria-label="Notificações"
        className="relative inline-flex h-8 w-8 items-center justify-center text-white/70 transition-colors hover:text-white"
      >
        <Bell size={18} className="relative transition-transform group-hover:rotate-[8deg]" strokeWidth={1.75} />
        {hasUnread && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-medium flex items-center justify-center ring-1 ring-green-dk tabular-nums"
            style={{ background: 'var(--color-orange)' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-3 w-[360px] max-h-[70vh] bg-surface border border-border-subtle overflow-hidden flex flex-col origin-top-right"
          style={{
            boxShadow: '0 24px 48px -12px rgba(20, 14, 4, 0.28), 0 8px 16px -8px rgba(20, 14, 4, 0.12)',
            animation: 'bell-pop 180ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: hasUnread ? 'var(--color-accent)' : 'var(--color-text-sec)' }}
              />
              <span className="text-sm font-medium text-text-primary tracking-tight">Notificações</span>
              {hasUnread && (
                <span className="text-[11px] text-text-secondary">· {unread} nova{unread > 1 ? 's' : ''}</span>
              )}
            </div>
            {hasUnread && (
              <button
                onClick={markAllRead}
                className="text-[11px] text-text-secondary hover:text-text-primary inline-flex items-center gap-1 transition-colors"
              >
                <Check size={12} /> Marcar lidas
              </button>
            )}
          </div>
          <div className="overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <div
                  className="mx-auto h-10 w-10 rounded-full flex items-center justify-center mb-3"
                  style={{ background: 'var(--color-surface-alt)' }}
                >
                  <Bell size={16} className="text-text-secondary" strokeWidth={1.5} />
                </div>
                <p className="text-xs text-text-secondary">Tudo em dia.</p>
                <p className="text-[11px] text-text-secondary opacity-70 mt-0.5">Nenhuma notificação aqui.</p>
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClickItem(n)}
                  className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-border-subtle last:border-0 hover:bg-surface-alt transition-colors relative ${
                    n.read_at ? '' : 'bg-surface-alt/50'
                  }`}
                >
                  {!n.read_at && (
                    <span
                      className="absolute left-1.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full"
                      style={{ background: 'var(--color-accent)' }}
                    />
                  )}
                  <Avatar name={n.actor_name} url={n.actor_avatar_url} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-text-primary leading-snug">{notificationText(n)}</p>
                    <p className="text-[11px] text-text-secondary mt-1">{relativeTime(n.created_at)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
