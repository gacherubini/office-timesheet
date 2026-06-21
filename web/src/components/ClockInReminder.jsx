import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlarmClock } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { Button } from './ui/Button'

const FIFTEEN_MIN_MS = 15 * 60 * 1000
const POLL_MS = 30 * 1000
const FIRST_SEEN_KEY = 'clockReminderFirstSeen' // { date, ts }
const SHOWN_KEY = 'clockReminderShownDate' // 'YYYY-MM-DD'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

// Lembra o usuário (que bate ponto) de iniciar o apontamento, uma vez por dia,
// após 15 min de site aberto e somente se ainda não bateu ponto hoje.
export function ClockInReminder() {
  const { profile, isAdmin, isAdministrativeIntern } = useAuth()
  const navigate = useNavigate()
  // Só quem bate ponto: colaborador e gestor de projetos.
  const eligible = Boolean(profile) && !isAdmin && !isAdministrativeIntern
  const [open, setOpen] = useState(false)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (!eligible) return

    const today = todayStr()

    // Marca o primeiro load do dia (sobrevive a reloads, não dá pra burlar).
    let firstSeen
    try {
      firstSeen = JSON.parse(localStorage.getItem(FIRST_SEEN_KEY) || 'null')
    } catch {
      firstSeen = null
    }
    if (!firstSeen || firstSeen.date !== today) {
      firstSeen = { date: today, ts: Date.now() }
      localStorage.setItem(FIRST_SEEN_KEY, JSON.stringify(firstSeen))
    }

    function alreadyShownToday() {
      return localStorage.getItem(SHOWN_KEY) === todayStr()
    }

    async function maybeRemind() {
      if (alreadyShownToday()) {
        clearInterval(intervalRef.current)
        return
      }
      if (Date.now() - firstSeen.ts < FIFTEEN_MIN_MS) return
      try {
        const status = await api.get('/me/time-clock-status')
        // Já bateu ponto hoje OU nunca apontou (recém-criado): não lembra.
        if (status?.clocked_in_today || !status?.has_any_entry) {
          clearInterval(intervalRef.current)
          return
        }
        localStorage.setItem(SHOWN_KEY, todayStr())
        clearInterval(intervalRef.current)
        setOpen(true)
        fireNotification()
      } catch {
        // silencioso: tenta de novo no próximo tick
      }
    }

    maybeRemind()
    intervalRef.current = setInterval(maybeRemind, POLL_MS)
    return () => clearInterval(intervalRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible])

  function fireNotification() {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    const show = () => {
      try {
        new Notification('Bater ponto', {
          body: 'Você ainda não iniciou seu apontamento de horas hoje.',
        })
      } catch {
        /* ignore */
      }
    }
    if (Notification.permission === 'granted') show()
    else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((p) => {
        if (p === 'granted') show()
      })
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md">
      <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-surface shadow-2xl p-6 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/15">
          <AlarmClock className="text-amber-500" size={32} />
        </div>
        <h2 className="font-display text-2xl text-text-primary mb-2">Bateu ponto?</h2>
        <p className="text-sm text-text-secondary mb-6">
          Você está no sistema há um tempo e ainda não iniciou seu apontamento de horas hoje.
          Que tal começar agora?
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Agora não
          </Button>
          <Button
            onClick={() => {
              setOpen(false)
              navigate('/project-board')
            }}
          >
            Apontar agora
          </Button>
        </div>
      </div>
    </div>
  )
}
