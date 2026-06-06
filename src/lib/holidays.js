// Feriados nacionais (Brasil) calculados localmente — inclui os móveis
// (Carnaval, Sexta-feira Santa, Corpus Christi) via algoritmo da Páscoa.
// Sem dependência de rede: funciona offline e é determinístico.

const cache = new Map() // year -> [{ date, name }]

function ymd(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Domingo de Páscoa (algoritmo de Meeus/Gregoriano).
function easterSunday(year) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) // 3 = março, 4 = abril
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function computeHolidays(year) {
  const easter = easterSunday(year)

  const list = [
    { date: `${year}-01-01`, name: 'Confraternização Universal' },
    { date: ymd(addDays(easter, -47)), name: 'Carnaval' },
    { date: ymd(addDays(easter, -2)), name: 'Sexta-feira Santa' },
    { date: `${year}-04-21`, name: 'Tiradentes' },
    { date: `${year}-05-01`, name: 'Dia do Trabalho' },
    { date: ymd(addDays(easter, 60)), name: 'Corpus Christi' },
    { date: `${year}-09-07`, name: 'Independência do Brasil' },
    { date: `${year}-10-12`, name: 'Nossa Senhora Aparecida' },
    { date: `${year}-11-02`, name: 'Finados' },
    { date: `${year}-11-15`, name: 'Proclamação da República' },
    { date: `${year}-12-25`, name: 'Natal' },
  ]

  // Consciência Negra virou feriado nacional a partir de 2024 (Lei 14.759/2023).
  if (year >= 2024) {
    list.push({ date: `${year}-11-20`, name: 'Dia da Consciência Negra' })
  }

  return list.sort((a, b) => a.date.localeCompare(b.date))
}

// Une duas listas por data. A da API tem prioridade no nome quando a data
// coincide; o cálculo local preenche o que faltar (ex.: Corpus Christi).
function mergeByDate(apiList, computed) {
  const byDate = new Map()
  for (const h of computed) byDate.set(h.date, h)
  for (const h of apiList) byDate.set(h.date, h)
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}

async function fetchFromApi(year) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 3500)
  try {
    const resp = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`, { signal: ctrl.signal })
    if (!resp.ok) throw new Error(`BrasilAPI ${resp.status}`)
    const data = await resp.json()
    return data.map((h) => ({ date: h.date, name: h.name }))
  } finally {
    clearTimeout(timer)
  }
}

export async function getHolidays(year) {
  const y = Number(year)
  if (!Number.isInteger(y) || y < 1900 || y > 2200) {
    throw new Error('ano inválido')
  }
  if (cache.has(y)) return cache.get(y)

  const computed = computeHolidays(y)
  try {
    const apiList = await fetchFromApi(y)
    const merged = mergeByDate(apiList, computed)
    cache.set(y, merged) // só cacheia quando a API respondeu
    return merged
  } catch {
    return computed // API fora: usa o local (não cacheia, tenta a API depois)
  }
}
