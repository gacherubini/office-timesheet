// Arquivos de relatório temporários, em memória, vários GETs, TTL curto.
// O cliente recebe só o token; o buffer nunca sai do servidor até o GET autenticado.
import { randomUUID } from 'node:crypto'

export const DOWNLOAD_TTL_MS = 5 * 60 * 1000
export const DOWNLOAD_MAX_BYTES = 10 * 1024 * 1024

const pending = new Map() // token → { userId, role, buffer, filename, mime, criadoEm }

// Expurgo preguiçoso: varre e apaga os vencidos a cada criação. Sem setInterval;
// o `now` é injetável para o teste ser determinístico.
function expurgarDownloadsVencidos(now) {
  for (const [id, d] of pending) {
    if (now - d.criadoEm > DOWNLOAD_TTL_MS) pending.delete(id)
  }
}

export function remember({ profile, buffer, filename, mime, now = Date.now() }) {
  if (buffer.length > DOWNLOAD_MAX_BYTES) {
    throw new Error('arquivo grande demais')
  }
  expurgarDownloadsVencidos(now)
  const token = randomUUID()
  pending.set(token, { userId: profile.id, role: profile.role, buffer, filename, mime, criadoEm: now })
  return { token }
}

// Observabilidade/teste: quantos arquivos pendentes há em memória agora.
export function pendingCount() {
  return pending.size
}

// Vários gets enquanto o TTL valer — não apaga no GET (baixar 2× não é perigoso).
export function get(token, profile, now = Date.now()) {
  const d = pending.get(token)
  if (!d) return null
  // Dono E papel: o requireAuth relê o profile do banco a cada request, então um
  // rebaixamento entre gerar e baixar chega até aqui.
  if (d.userId !== profile.id || d.role !== profile.role) return null
  if (now - d.criadoEm > DOWNLOAD_TTL_MS) return null
  return { buffer: d.buffer, filename: d.filename, mime: d.mime }
}
