import { resolvePeriodo } from '../../format.js'
import { listEventsForUser, isCalendarConnected } from '../../../calendar/events.js'

const YMD = /^\d{4}-\d{2}-\d{2}$/
const MAX_DIAS = 31

function diasInclusivos(inicio, fim) {
  return Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86400000) + 1
}

function amanhaYmd(now = new Date()) {
  const hoje = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
  const [y, m, d] = hoje.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + 1))
  return dt.toISOString().slice(0, 10)
}

function resolverJanela(args, now) {
  const temPeriodo = args?.periodo != null && args.periodo !== ''
  const temInicio = args?.inicio != null && args.inicio !== ''
  const temFim = args?.fim != null && args.fim !== ''
  if (temPeriodo && (temInicio || temFim)) throw new Error('informe só o período ou só inicio e fim')
  if (temInicio !== temFim) throw new Error('inicio e fim são obrigatórios juntos')
  let inicio, fim
  if (temInicio) {
    if (!YMD.test(args.inicio) || !YMD.test(args.fim)) throw new Error('inicio e fim devem ser YYYY-MM-DD')
    inicio = args.inicio
    fim = args.fim
  } else if (args?.periodo === 'amanha') {
    const a = amanhaYmd(now)
    inicio = a
    fim = a
  } else {
    const p = resolvePeriodo(args?.periodo || 'hoje', now)
    inicio = p.inicio
    fim = p.fim
  }
  if (diasInclusivos(inicio, fim) > MAX_DIAS) throw new Error('o intervalo máximo é 31 dias; peça um recorte menor')
  if (fim < inicio) throw new Error('fim não pode ser antes de inicio')
  return { inicio, fim }
}

function mapear(ev) {
  return {
    titulo: ev.title,
    inicio: ev.start,
    fim: ev.end,
    dia_todo: ev.all_day,
    local: ev.location,
    fonte: ev.source,
  }
}

const definition = {
  type: 'function',
  function: {
    name: 'agenda_do_periodo',
    description:
      'Eventos da SUA agenda no período: Google pessoal (se ligada), agenda do escritório e feriados. Não vê a agenda de outra pessoa. periodo: hoje (padrão), amanha, semana ou mes; ou inicio+fim YYYY-MM-DD (máx. 31 dias).',
    parameters: {
      type: 'object',
      properties: {
        periodo: { type: 'string', enum: ['hoje', 'amanha', 'semana', 'mes'] },
        inicio: { type: 'string', description: 'YYYY-MM-DD' },
        fim: { type: 'string', description: 'YYYY-MM-DD' },
      },
      additionalProperties: false,
    },
  },
}

async function run(profile, args, now = new Date()) {
  const { inicio, fim } = resolverJanela(args, now)
  const start = new Date(`${inicio}T00:00:00`)
  const end = new Date(`${fim}T23:59:59`)
  const [conectado, { events, calendar_error }] = await Promise.all([
    isCalendarConnected(profile.id),
    listEventsForUser(profile.id, start, end),
  ])
  const data = events.map(mapear)
  return { data, count: data.length, conectado, calendar_error }
}

export default {
  kind: 'read',
  espelha: 'GET /me/calendar/events',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition,
  run,
}
