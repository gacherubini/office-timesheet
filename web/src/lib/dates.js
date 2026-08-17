// Datas de negócio (bônus, despesas, férias, prazos, nascimento) são colunas
// `date` no Postgres e chegam da API como string pura "YYYY-MM-DD" — sem hora,
// sem fuso. `new Date('2026-08-17')` é meia-noite UTC; em São Paulo (UTC-3) a
// tela imprimia 16/08. Data pura aqui é recorte de string, sem instante no meio
// — mesma convenção do backend em src/lib/agent/format.js.

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * "Hoje" no fuso do estúdio, "YYYY-MM-DD". 'en-CA' já formata assim.
 * new Date().toISOString().slice(0,10) devolve o dia em UTC — entre 21h e 00h
 * em BRT isso é amanhã, e formulários abriam pré-preenchidos com o dia errado.
 */
export function todayInSaoPaulo() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/** "YYYY-MM-DD" → "DD/MM/YYYY". Timestamp ISO ou Date → dia no fuso local. */
export function formatDateBR(value, vazio = '-') {
  if (!value) return vazio

  if (typeof value === 'string') {
    const puro = value.match(YMD)
    if (puro) return `${puro[3]}/${puro[2]}/${puro[1]}`
  }

  const dt = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(dt.getTime())) return vazio
  return dt.toLocaleDateString('pt-BR')
}
