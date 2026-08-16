// Agrupamento e rótulo de data do histórico de conversas do Assistente.
//
// O rótulo muda conforme o grupo porque o grupo já carrega parte da informação:
// dentro de "Hoje" o que importa é há quanto tempo; em "Ontem" o dia já está
// dito, então vale a hora do relógio; mais atrás, a data.

import { differenceInCalendarDays, differenceInMinutes, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

function paraData(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

// Distância em dias de calendário — 23h atrás pode ser ontem, 1h atrás também.
function diasAtras(d, agora) {
  return differenceInCalendarDays(agora, d)
}

export function rotuloHora(iso, agora = new Date()) {
  const d = paraData(iso)
  if (!d) return ''
  const dias = diasAtras(d, agora)
  if (dias === 0) {
    const min = differenceInMinutes(agora, d)
    if (min < 60) return 'agora'
    return `${Math.floor(min / 60)} h`
  }
  if (dias === 1) return format(d, 'HH:mm')
  if (d.getFullYear() === agora.getFullYear()) return format(d, 'd MMM', { locale: ptBR })
  return format(d, 'd MMM yyyy', { locale: ptBR })
}

// Ordem fixa: os grupos saem sempre nesta sequência, e os vazios não aparecem.
const GRUPOS = [
  { rotulo: 'Hoje', cabe: (dias) => dias === 0 },
  { rotulo: 'Ontem', cabe: (dias) => dias === 1 },
  { rotulo: 'Últimos 7 dias', cabe: (dias) => dias >= 2 && dias <= 6 },
  { rotulo: 'Mais antigas', cabe: () => true },
]

export function agruparPorData(items, agora = new Date()) {
  const baldes = GRUPOS.map((g) => ({ rotulo: g.rotulo, items: [] }))
  for (const item of items || []) {
    const d = paraData(item?.last_message_at)
    // Sem data legível a conversa vai pro fim em vez de sumir da lista.
    const dias = d ? diasAtras(d, agora) : Infinity
    const i = GRUPOS.findIndex((g) => g.cabe(dias))
    baldes[i].items.push(item)
  }
  return baldes.filter((b) => b.items.length > 0)
}
