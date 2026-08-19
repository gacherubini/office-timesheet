import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Topbar } from './Topbar'
import { ClockInReminder } from './ClockInReminder'
import { ChatPanel } from './assistente/ChatPanel'
import { FloatingChatButton } from './assistente/FloatingChatButton'
import { api } from '../lib/api'

const HEARTBEAT_MS = 60_000

export function Layout({ children }) {
  const [chatAberto, setChatAberto] = useState(false)
  const { pathname } = useLocation()

  // Botão flutuante sobre a própria página do assistente seria ruído.
  const naPaginaDoAssistente = pathname.startsWith('/assistente')

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
      {!naPaginaDoAssistente && (
        <>
          <FloatingChatButton onClick={() => setChatAberto(true)} />
          <ChatPanel aberto={chatAberto} onFechar={() => setChatAberto(false)} />
        </>
      )}
    </div>
  )
}
