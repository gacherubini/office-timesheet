// Feriados nacionais (Brasil) via BrasilAPI, com cache em memória por ano e
// fallback estático pros feriados de data fixa (caso a API esteja fora).
// Móveis (Carnaval, Sexta-feira Santa, Corpus Christi) só vêm da API — melhor
// faltar do que devolver data errada.

const cache = new Map() // year -> [{ date, name }]

function staticFallback(year) {
  const fixed = [
    ['01-01', 'Confraternização Universal'],
    ['04-21', 'Tiradentes'],
    ['05-01', 'Dia do Trabalho'],
    ['09-07', 'Independência do Brasil'],
    ['10-12', 'Nossa Senhora Aparecida'],
    ['11-02', 'Finados'],
    ['11-15', 'Proclamação da República'],
    ['12-25', 'Natal'],
  ]
  return fixed.map(([md, name]) => ({ date: `${year}-${md}`, name }))
}

export async function getHolidays(year) {
  const y = Number(year)
  if (!Number.isInteger(y) || y < 1900 || y > 2200) {
    throw new Error('ano inválido')
  }
  if (cache.has(y)) return cache.get(y)

  let holidays
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    const resp = await fetch(`https://brasilapi.com.br/api/v2/feriados/${y}`, {
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!resp.ok) throw new Error(`BrasilAPI ${resp.status}`)
    const data = await resp.json()
    holidays = data.map((h) => ({ date: h.date, name: h.name }))
  } catch {
    holidays = staticFallback(y) // não cacheia o fallback (tenta API de novo depois)
    return holidays
  }

  cache.set(y, holidays)
  return holidays
}
