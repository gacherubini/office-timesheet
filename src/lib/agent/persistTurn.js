// Adaptador: monta as rows persistidas (content OpenAI + ui jsonb) a partir
// da fatia do turno e dos eventos SSE. O laço não conhece isto (§8.4).

export function toPersistedRows({
  novos = [],
  textoDigitado = '',
  anexoNome = null,
  eventos = [],
  lastAnswer = null,
}) {
  const rows = novos.map((m) => ({
    role: m.role,
    content: m.content ?? null,
    tool_calls: m.tool_calls ?? null,
    tool_call_id: m.tool_call_id ?? null,
    ui: null,
  }))

  const firstUser = rows.find((r) => r.role === 'user')
  if (firstUser) {
    const ui = { texto_visivel: textoDigitado ?? '' }
    if (anexoNome) ui.anexo = anexoNome
    firstUser.ui = ui
  }

  const proposal = [...eventos].reverse().find((e) => e.type === 'proposal')
  if (proposal) {
    const alvo = [...rows].reverse().find((r) => r.role === 'assistant' && r.tool_calls)
    if (alvo) alvo.ui = { proposta: { descricao: proposal.descricao, dados: proposal.dados } }
  }

  const arquivos = eventos
    .filter((e) => e.type === 'file')
    .map(({ token, filename, mime, bytes }) => ({ token, filename, mime, bytes }))
  if (arquivos.length) {
    const comContent = rows.find((r) => r.role === 'assistant' && r.content)
    const comProposta = rows.find((r) => r.ui?.proposta)
    const alvo = comContent || comProposta
    if (alvo) alvo.ui = { ...(alvo.ui || {}), arquivos }
  }

  for (const r of rows) {
    if (r.role === 'tool') r.ui = null
    if (r.role === 'assistant' && !r.content && !r.ui?.proposta && !r.ui?.arquivos) r.ui = null
  }

  const temAssistantContent = rows.some((r) => r.role === 'assistant' && r.content)
  if (lastAnswer && !temAssistantContent) {
    rows.push({
      role: 'assistant',
      content: lastAnswer,
      tool_calls: null,
      tool_call_id: null,
      ui: null,
    })
  }

  return rows
}

export function messagesToUi(rows = []) {
  const out = []
  for (const r of rows) {
    if (r.role === 'tool') continue
    const ui = r.ui || {}
    if (r.role === 'assistant' && !r.content && !ui.proposta && !ui.arquivos && !ui.erro) continue
    if (r.role === 'user') {
      out.push({ autor: 'user', texto: ui.texto_visivel, anexo: ui.anexo })
      continue
    }
    if (r.role === 'assistant') {
      out.push({
        autor: 'bot',
        texto: r.content || '',
        proposta: ui.proposta ? { ...ui.proposta, expirado: true } : undefined,
        arquivos: ui.arquivos,
      })
    }
  }
  return out
}
