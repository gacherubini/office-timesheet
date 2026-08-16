// Texto da procedência no rodapé da bolha. O servidor manda
// { rotulo, detalhe, count }; aqui isso vira uma linha que se lê em voz alta.

function linhas(n) {
  if (n === null || n === undefined) return ''
  return n === 1 ? '1 linha' : `${n} linhas`
}

export function textoDaFonte(fonte) {
  if (!fonte?.rotulo) return ''
  return [fonte.rotulo, fonte.detalhe, linhas(fonte.count)]
    .filter(Boolean)
    .join(' · ')
}

// Rótulo do conjunto. Uma fonte se explica sozinha; várias precisam de um
// resumo, senão o rodapé vira parágrafo.
export function resumoDasFontes(fontes) {
  const items = (fontes || []).filter((f) => f?.rotulo)
  if (items.length === 0) return ''
  if (items.length === 1) return textoDaFonte(items[0])
  return `${items.length} consultas`
}
