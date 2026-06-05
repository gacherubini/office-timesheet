const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

// Abre o stream SSE de notificações. Retorna o EventSource (ou null sem token).
// O EventSource reconecta sozinho em caso de queda (retry nativo).
export function openNotificationStream(onMessage) {
  const token = localStorage.getItem('access_token')
  if (!token) return null
  const es = new EventSource(`${BASE_URL}/notifications/stream?token=${encodeURIComponent(token)}`)
  es.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data))
    } catch {
      // ignora frames não-JSON (heartbeats começam com ':')
    }
  }
  return es
}
