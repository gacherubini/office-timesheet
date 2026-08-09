// Cliente do agente no front. O chat é POST streamado (EventSource é só GET),
// então lemos o corpo com fetch + reader e parseamos os frames "data: {...}".
import { api } from './api'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

export function parseSseBuffer(buffer) {
  const partes = buffer.split('\n\n')
  const resto = partes.pop() // último pedaço pode estar incompleto
  const eventos = []
  for (const p of partes) {
    const linha = p.replace(/^data: /, '').trim()
    if (linha) {
      try { eventos.push(JSON.parse(linha)) } catch { /* frame não-JSON: ignora */ }
    }
  }
  return { eventos, resto }
}

export async function streamChat({ message, conversationId, onEvent }) {
  const token = localStorage.getItem('access_token')
  const res = await fetch(`${BASE_URL}/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: JSON.stringify({ message, conversation_id: conversationId }),
  })
  if (!res.ok || !res.body) throw new Error('Falha ao falar com o agente.')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const { eventos, resto } = parseSseBuffer(buffer)
    buffer = resto
    for (const e of eventos) onEvent(e)
  }
}

export function executeProposal(proposalId) {
  return api.post(`/agent/actions/${proposalId}/execute`, {})
}
