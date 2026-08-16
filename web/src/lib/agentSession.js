// Persistência local da última conversa persistida do Assistente.
//
// v2 guarda só o id (o transcript vive no Postgres). v1 com mensagens[] some
// no primeiro lerSessao. TTL 30 dias casa com a retenção do servidor. Só o
// AssistentePage escreve o id depois de um turno que não abortou.

const CHAVE = 'assistente:sessao'
export const TTL_MS = 30 * 24 * 60 * 60 * 1000

function storage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null // acesso a localStorage pode lançar (modo restrito/SSR)
  }
}

export function lerSessao(userId, agora = Date.now()) {
  const st = storage()
  if (!st || !userId) return null
  try {
    const raw = st.getItem(CHAVE)
    if (!raw) return null
    const s = JSON.parse(raw)
    // v1 (mensagens[]) some aqui. Escopo por dono: outro login não restaura.
    if (s.v !== 2 || s.userId !== userId) {
      st.removeItem(CHAVE)
      return null
    }
    if (agora - s.updatedAt > TTL_MS) {
      st.removeItem(CHAVE)
      return null
    }
    return { conversationId: s.conversationId ?? null }
  } catch {
    return null // JSON corrompido: trata como se não houvesse conversa
  }
}

export function salvarSessao(userId, { conversationId }, agora = Date.now()) {
  const st = storage()
  if (!st || !userId) return
  try {
    if (!conversationId) {
      st.removeItem(CHAVE)
      return
    }
    st.setItem(CHAVE, JSON.stringify({
      v: 2,
      userId,
      conversationId,
      updatedAt: agora,
    }))
  } catch {
    /* quota/serialização falhou: degrada para efêmero, sem quebrar a UI */
  }
}

export function limparSessao() {
  const st = storage()
  if (!st) return
  try {
    st.removeItem(CHAVE)
  } catch {
    /* ignora */
  }
}
