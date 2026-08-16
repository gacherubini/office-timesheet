// Aplica um evento SSE à bolha do assistente. Tokens são só pintura;
// `answer` substitui o texto acumulado (é a versão canônica).

export function aplicarEventoMensagem(msg, e) {
  if (!msg || !e) return msg
  if (e.type === 'token') {
    return { ...msg, texto: `${msg.texto || ''}${e.text || ''}` }
  }
  if (e.type === 'token_revoke') {
    return { ...msg, texto: '' }
  }
  if (e.type === 'answer') {
    return { ...msg, texto: e.text, links: e.links }
  }
  return msg
}
