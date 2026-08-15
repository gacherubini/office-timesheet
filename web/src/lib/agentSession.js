// Persistência local da conversa do Assistente.
//
// A sessão do servidor é efêmera (30 min, em memória, keyed por conversationId —
// ver src/lib/agent/session.js) e a página guardava conversationId + mensagens só
// em useState. Resultado: navegar na navbar desmontava a página e perdia tudo,
// abrindo uma sessão nova no backend no envio seguinte. Aqui espelhamos o MESMO
// TTL no localStorage, com escopo por usuário, para a conversa sobreviver à
// navegação e ao reload — resetando só (a) após 30 min de inatividade ou (b) no
// "Nova conversa". `agora` é injetável para o teste ser determinístico, igual ao
// `now` do session.js do servidor.

const CHAVE = 'assistente:sessao'
export const TTL_MS = 30 * 60 * 1000

function storage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null // acesso a localStorage pode lançar (modo restrito/SSR)
  }
}

// Tira o que não faz sentido (ou não pode) atravessar o localStorage:
//  - `executando`: um "Aprovando…" congelado de uma execução que já terminou.
//  - `arquivoObj`: o File do anexo. JSON.stringify o serializa como {}, e um {}
//    truthy no lugar de um File faria o reenvio mandar "[object Object]" como
//    arquivo. O nome fica em `anexo`, que é o que a bolha exibe.
//  - NÃO tira `arquivo` (token/filename/mime/bytes): é JSON-safe. O botão
//    Baixar reaparece após reload; o 404 do GET cobre o TTL do servidor.
function limparNaoSerializaveis(mensagens) {
  return mensagens.map((m) => {
    if (!m.executando && !m.arquivoObj) return m
    const { arquivoObj: _descartado, ...resto } = m
    return m.executando ? { ...resto, executando: false } : resto
  })
}

export function lerSessao(userId, agora = Date.now()) {
  const st = storage()
  if (!st || !userId) return null
  try {
    const raw = st.getItem(CHAVE)
    if (!raw) return null
    const s = JSON.parse(raw)
    // Escopo por dono: a conversa de outro login nunca é restaurada aqui.
    if (s.userId !== userId || !Array.isArray(s.mensagens)) return null
    if (agora - s.updatedAt > TTL_MS) {
      st.removeItem(CHAVE)
      return null
    }
    return { conversationId: s.conversationId ?? null, mensagens: s.mensagens }
  } catch {
    return null // JSON corrompido: trata como se não houvesse conversa
  }
}

export function salvarSessao(userId, { conversationId, mensagens }, agora = Date.now()) {
  const st = storage()
  if (!st || !userId) return
  try {
    // Conversa vazia e sem id: nada a guardar — limpa em vez de deixar lixo.
    if (!mensagens?.length && !conversationId) {
      st.removeItem(CHAVE)
      return
    }
    st.setItem(CHAVE, JSON.stringify({
      v: 1,
      userId,
      conversationId: conversationId ?? null,
      mensagens: limparNaoSerializaveis(mensagens || []),
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
