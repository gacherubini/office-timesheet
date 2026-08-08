// "Hoje" no fuso do domínio (America/Sao_Paulo). 'en-CA' já formata YYYY-MM-DD.
export function todayInSaoPaulo() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

const fmt = (date) => date.toISOString().slice(0, 10)

// Contas em UTC: o Date local mudaria de dia conforme o fuso de quem abre a tela.
export function getPeriodRange(period, today = todayInSaoPaulo()) {
  const [year, month, day] = today.split('-').map(Number)

  if (period === 'week') {
    const base = new Date(Date.UTC(year, month - 1, day))
    const mondayOffset = (base.getUTCDay() + 6) % 7
    const start = new Date(base)
    start.setUTCDate(base.getUTCDate() - mondayOffset)
    const end = new Date(start)
    end.setUTCDate(start.getUTCDate() + 6)
    return { start_date: fmt(start), end_date: fmt(end) }
  }

  if (period === 'quarter') {
    const firstMonth = Math.floor((month - 1) / 3) * 3
    return {
      start_date: fmt(new Date(Date.UTC(year, firstMonth, 1))),
      end_date: fmt(new Date(Date.UTC(year, firstMonth + 3, 0))),
    }
  }

  return {
    start_date: fmt(new Date(Date.UTC(year, month - 1, 1))),
    end_date: fmt(new Date(Date.UTC(year, month, 0))),
  }
}
