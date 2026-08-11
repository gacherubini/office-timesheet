// Aniversários como dado social do time. Só dia/mês saem daqui — o ANO (a idade)
// nunca é exposto, é a decisão de privacidade da feature. Função pura, sem banco:
// o endpoint e a tool do agente montam a lista de usuários e delegam o "quem
// comemora" para cá, testável isolada (mesmo precedente de performanceSimulation.js).

// Extrai ano/mês/dia de um birth_date, aceitando tanto Date (o driver pg parseia
// a coluna `date` num Date à meia-noite LOCAL) quanto string 'YYYY-MM-DD'. Nos
// dois casos os componentes locais/parseados são os corretos; usar UTC aqui
// deslocaria o dia. Retorna null quando não há data.
function partes(birthDate) {
  if (!birthDate) return null
  if (birthDate instanceof Date) {
    return { ano: birthDate.getFullYear(), mes: birthDate.getMonth() + 1, dia: birthDate.getDate() }
  }
  const [ano, mes, dia] = String(birthDate).slice(0, 10).split('-').map(Number)
  if (!mes || !dia) return null
  return { ano, mes, dia }
}

function bissexto(ano) {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0
}

// É aniversário de quem nasceu em `birthDate` na data `refYmd` ('YYYY-MM-DD')?
// Quem nasceu em 29/02 comemora em 28/02 nos anos não-bissextos (default humano,
// senão só teria aniversário de quatro em quatro anos).
export function ehAniversario(birthDate, refYmd) {
  const p = partes(birthDate)
  if (!p) return false
  const [ry, rm, rd] = String(refYmd).split('-').map(Number)
  if (p.mes === rm && p.dia === rd) return true
  if (p.mes === 2 && p.dia === 29 && !bissexto(ry) && rm === 2 && rd === 28) return true
  return false
}

// Filtra os aniversariantes de uma lista de usuários e projeta para o formato
// público (nome, dia, mês, cargo — nunca o ano). Sem `mes`, são os de `hoje`;
// com `mes` (1-12), todos daquele mês. Ordenado por mês, dia e nome.
export function aniversariantes(users, { hoje, mes } = {}) {
  const comData = (users || []).filter((u) => partes(u.birth_date))
  const selecionados =
    mes != null
      ? comData.filter((u) => partes(u.birth_date).mes === mes)
      : comData.filter((u) => ehAniversario(u.birth_date, hoje))
  return selecionados
    .map((u) => {
      const p = partes(u.birth_date)
      return { nome: u.name, dia: p.dia, mes: p.mes, cargo: u.position || null }
    })
    .sort((a, b) => a.mes - b.mes || a.dia - b.dia || a.nome.localeCompare(b.nome, 'pt-BR'))
}
