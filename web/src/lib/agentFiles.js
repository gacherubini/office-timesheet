// Anexos gerados pelo assistente na bolha. O SSE manda um evento `file` por
// arquivo; a UI acumula. Sessões antigas ainda têm `arquivo` no singular.

export function arquivosDaMensagem(msg) {
  if (!msg) return []
  if (Array.isArray(msg.arquivos) && msg.arquivos.length) return msg.arquivos
  if (msg.arquivo) return [msg.arquivo]
  return []
}

export function anexarArquivo(msg, file) {
  return { ...msg, arquivos: [...arquivosDaMensagem(msg), file] }
}
