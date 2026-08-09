// Fonte única de fuso e formatação para o agente (§7 do design). Usada tanto
// pelas tools (ao montar filtros de data) quanto pela camada de resposta.
export const TZ = 'America/Sao_Paulo'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatBRL(n) {
  return brl.format(Number(n) || 0)
}

// YMD no fuso do estúdio a partir de um Date. 'en-CA' dá exatamente 'YYYY-MM-DD'.
function ymdSP(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

export function formatDateBR(d) {
  const ymd = typeof d === 'string' ? d.slice(0, 10) : ymdSP(d)
  const [y, m, day] = ymd.split('-')
  return `${day}/${m}/${y}`
}

export function resolvePeriodo(nome, now = new Date()) {
  const hoje = ymdSP(now)
  const [y, m, d] = hoje.split('-').map(Number)
  if (nome === 'hoje') return { inicio: hoje, fim: hoje }
  if (nome === 'mes') {
    const inicio = `${y}-${String(m).padStart(2, '0')}-01`
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate() // dia 0 do mês seguinte = último do atual
    const fim = `${y}-${String(m).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`
    return { inicio, fim }
  }
  if (nome === 'semana') {
    // Semana de segunda a domingo, ancorada no dia corrente do fuso SP.
    const base = new Date(Date.UTC(y, m - 1, d))
    const dow = (base.getUTCDay() + 6) % 7 // 0 = segunda
    const seg = new Date(base); seg.setUTCDate(base.getUTCDate() - dow)
    const dom = new Date(seg); dom.setUTCDate(seg.getUTCDate() + 6)
    return { inicio: seg.toISOString().slice(0, 10), fim: dom.toISOString().slice(0, 10) }
  }
  throw new Error(`período desconhecido: ${nome}`)
}
