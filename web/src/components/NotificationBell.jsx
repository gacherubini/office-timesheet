import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Check } from 'lucide-react'
import { api } from '../lib/api'
import { openNotificationStream } from '../lib/notificationsClient'
import { Avatar } from './Avatar'
import { notificationText, relativeTime } from '../pages/projectBoard/helpers'

export function NotificationBell({ expanded }) {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)

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

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return
    function onClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
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
    if (n.task_id) navigate(`/project-board?task=${n.task_id}`)
  }

  async function markAllRead() {
    setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at || new Date().toISOString() })))
    setUnread(0)
    api.post('/notifications/read-all').catch(() => {})
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-white/60 hover:text-white text-[13px] transition-colors relative"
        title="Notificações"
        aria-label="Notificações"
      >
        <span className="relative">
          <Bell size={16} />
          {unread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-semibold flex items-center justify-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </span>
        <span className={expanded ? 'inline' : 'hidden'}>Notificações</span>
      </button>

      {open && (
        <div className="fixed left-4 bottom-20 z-50 w-80 max-h-[60vh] bg-surface border border-border-subtle rounded-xl shadow-2xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
            <span className="text-sm font-medium text-text-primary">Notificações</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-[11px] text-text-secondary hover:text-text-primary inline-flex items-center gap-1">
                <Check size={12} /> Marcar lidas
              </button>
            )}
          </div>
          <div className="overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-xs text-text-secondary text-center py-8">Nenhuma notificação.</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClickItem(n)}
                  className={`w-full text-left flex items-start gap-2.5 px-4 py-3 border-b border-border-subtle hover:bg-surface-alt transition-colors ${
                    n.read_at ? '' : 'bg-accent/5'
                  }`}
                >
                  <Avatar name={n.actor_name} url={n.actor_avatar_url} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-text-primary leading-snug">{notificationText(n)}</p>
                    <p className="text-[10px] text-text-secondary mt-0.5">{relativeTime(n.created_at)}</p>
                  </div>
                  {!n.read_at && <span className="w-2 h-2 rounded-full bg-accent mt-1 flex-shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
