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
    // O proposalId é a identidade da linha: sem ele, o execute/cancel não tem
    // como voltar aqui e marcar o desfecho, e toda proposta recarregada teria
    // de nascer "expirada" — inclusive as que foram executadas.
    if (alvo) {
      alvo.ui = {
        proposta: {
          descricao: proposal.descricao,
          dados: proposal.dados,
          comAnexo: !!proposal.comAnexo,
          ...(proposal.proposalId ? { proposalId: proposal.proposalId } : {}),
        },
      }
    }
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

  // Procedência por último: precisa enxergar também a bolha que só existe
  // porque `lastAnswer` acabou de ser empurrada acima.
  const sources = [...eventos].reverse().find((e) => e.type === 'sources')
  if (sources?.items?.length) {
    const alvo = [...rows].reverse().find((r) => r.role === 'assistant' && r.content)
    if (alvo) alvo.ui = { ...(alvo.ui || {}), fontes: sources.items }
  }

  return rows
}

export function messagesToUi(rows = []) {
  const out = []
  for (const r of rows) {
    if (r.role === 'tool') continue
    const ui = r.ui || {}
    // A nota "✓ Executado"/"✗ Cancelado" existe para o MODELO saber no turno
    // seguinte o que aconteceu. Quem está olhando a tela já vê o desfecho no
    // próprio card — repetir vira a duplicata que fazia a conversa parecer
    // contraditória.
    if (ui.nota_execucao) continue
    if (r.role === 'assistant' && !r.content && !ui.proposta && !ui.arquivos && !ui.erro) continue
    if (r.role === 'user') {
      out.push({ autor: 'user', texto: ui.texto_visivel, anexo: ui.anexo })
      continue
    }
    if (r.role === 'assistant') {
      // Sem desfecho gravado a proposta nasce expirada: o id em memória some em
      // 5 min (e no restart), então o botão Aprovar não teria o que acionar.
      // Com desfecho, ela volta como o que de fato foi — concluída ou recusada.
      const desfecho = ui.proposta?.desfecho
      out.push({
        autor: 'bot',
        // id da linha: é por ele que a avaliação aponta para esta resposta.
        id: r.id,
        texto: r.content || '',
        proposta: ui.proposta
          ? { ...ui.proposta, expirado: !desfecho }
          : undefined,
        aprovado: desfecho === 'executado' || undefined,
        cancelado: desfecho === 'cancelado' || undefined,
        arquivos: ui.arquivos,
        fontes: ui.fontes,
      })
    }
  }
  return out
}
