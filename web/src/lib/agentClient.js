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

// Monta headers + body do POST. Com arquivo, vira multipart (FormData) e o
// Content-Type fica por conta do browser (que precisa cravar o boundary); sem
// arquivo, é o JSON de sempre. Função pura pra ser testável sem fetch.
export function buildChatRequest({ message, conversationId, file, token }) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (file) {
    const fd = new FormData()
    fd.append('message', message ?? '')
    if (conversationId) fd.append('conversation_id', conversationId)
    fd.append('file', file)
    return { headers, body: fd }
  }
  headers['Content-Type'] = 'application/json'
  return { headers, body: JSON.stringify({ message, conversation_id: conversationId }) }
}

// Extrai a mensagem de erro do corpo (a rota manda { error } em 400/413) pra não
// engolir "Formato não suportado" / "Arquivo grande demais" num genérico.
export async function readErrorMessage(res, fallback = 'Falha ao falar com o agente.') {
  try {
    const j = await res.json()
    if (j?.error) return j.error
  } catch { /* corpo não-JSON: usa o fallback */ }
  return fallback
}

export async function streamChat({ message, conversationId, file, signal, onEvent }) {
  const token = localStorage.getItem('access_token')
  const { headers, body } = buildChatRequest({ message, conversationId, file, token })
  const res = await fetch(`${BASE_URL}/agent/chat`, { method: 'POST', headers, body, signal })
  if (!res.ok || !res.body) throw new Error(await readErrorMessage(res))

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

export function cancelProposal(proposalId) {
  return api.post(`/agent/actions/${proposalId}/cancel`, {})
}

// GET /agent/downloads/:token com Bearer. O <a href> não leva JWT, então o
// chat faz fetch, vira blob e dispara o download. 404 = TTL / outro user /
// sumiu — mensagem genérica, sem distinguir o motivo.
export async function downloadAgentFile(token) {
  const auth = localStorage.getItem('access_token')
  const res = await fetch(`${BASE_URL}/agent/downloads/${encodeURIComponent(token)}`, {
    headers: auth ? { Authorization: `Bearer ${auth}` } : {},
  })
  if (!res.ok) throw new Error(await readErrorMessage(res, 'arquivo expirado ou indisponível'))
  const blob = await res.blob()
  const disp = res.headers.get('Content-Disposition') || ''
  const m = /filename="([^"]+)"/.exec(disp)
  const name = m?.[1] || 'relatorio'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
