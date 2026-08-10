// Datas de negócio no fuso do estúdio. Em produção o processo roda em UTC (Fly);
// new Date().toISOString().slice(0,10) e getFullYear/getMonth do host derrubam
// o "hoje" e o mês corrente entre 21h e 00h BRT.

export const APP_TZ = 'America/Sao_Paulo'

/** YYYY-MM-DD no fuso do estúdio. */
export function dateInSaoPaulo(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ }).format(date)
}

/** Ano e mês (1-12) no fuso do estúdio. */
export function yearMonthInSaoPaulo(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TZ,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date)
  return {
    year: Number(parts.find((p) => p.type === 'year').value),
    month: Number(parts.find((p) => p.type === 'month').value),
  }
}

/**
 * Range half-open de time_entries no fuso do estúdio.
 * Usar ::timestamp (não ::date): `date AT TIME ZONE tz` no Postgres não produz
 * meia-noite em tz — vaza a noite BRT para o dia UTC seguinte.
 */
export const SP_RANGE_SQL = {
  gteStart: (param) => `(${param}::timestamp AT TIME ZONE '${APP_TZ}')`,
  ltEndExclusive: (param) => `((${param}::date + interval '1 day')::timestamp AT TIME ZONE '${APP_TZ}')`,
  localDay: (column = 'started_at') => `(${column} AT TIME ZONE '${APP_TZ}')::date`,
}
