import { useEffect } from 'react'
import { Topbar } from './Topbar'
import { ClockInReminder } from './ClockInReminder'
import { api } from '../lib/api'

const HEARTBEAT_MS = 60_000

export function Layout({ children }) {
  // Sinal de vida para o indicador "usuários online" (src/lib/onlineUsers.js).
  // Só com a aba visível: aba aberta no fundo durante o almoço não é presença.
  // Falha em silêncio — perder um heartbeat não pode virar erro na tela.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') {
        api.post('/me/heartbeat').catch(() => {})
      }
    }, HEARTBEAT_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <Topbar />
      <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
      <ClockInReminder />
    </div>
  )
}
