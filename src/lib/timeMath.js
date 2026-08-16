// Matemática dos apontamentos — o núcleo sensível (pagamento depende disso).
// Extraído para um módulo próprio para ser testável de forma isolada e
// reutilizado por todos os caminhos (cronômetro ao vivo e entrada manual).

// Duração em minutos entre dois instantes, arredondada (meia pra cima) e
// nunca negativa. Ex.: 90s → 2 min, 89s → 1 min, 29s → 0 min.
export function calculateDurationMinutes(start, end) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
}

// Custo do apontamento = horas × valor/hora, com 2 casas. Rate ausente → 0.
export function calculateCostSnapshot(durationMinutes, hourlyRate) {
  return Number(((durationMinutes / 60) * (Number(hourlyRate) || 0)).toFixed(2))
}

// Duração líquida: parede-relógio menos o overlap das pausas com [start, end].
// Pausa sem resumed_at conta até `end` (stop durante pausa).
export function netDurationMinutes(start, end, pauses = []) {
  const startDate = start instanceof Date ? start : new Date(start)
  const endDate = end instanceof Date ? end : new Date(end)
  let pausedMs = 0
  for (const pause of pauses) {
    if (!pause?.paused_at) continue
    const ini = new Date(pause.paused_at)
    const fim = pause.resumed_at ? new Date(pause.resumed_at) : endDate
    const overlapStart = Math.max(startDate.getTime(), ini.getTime())
    const overlapEnd = Math.min(endDate.getTime(), fim.getTime())
    pausedMs += Math.max(0, overlapEnd - overlapStart)
  }
  const durationMs = endDate.getTime() - startDate.getTime() - pausedMs
  return calculateDurationMinutes(new Date(0), new Date(Math.max(0, durationMs)))
}

// Recupera a taxa congelada no snapshot. Sem duração/custo, usa o fallback
// (taxa atual) — apontamento novo ou custo zero de propósito.
export function rateFromSnapshot(durationMinutes, costSnapshot, fallbackRate = 0) {
  const mins = Number(durationMinutes) || 0
  if (mins <= 0 || costSnapshot == null || costSnapshot === '') return Number(fallbackRate) || 0
  const cost = Number(costSnapshot)
  if (!Number.isFinite(cost)) return Number(fallbackRate) || 0
  return cost / (mins / 60)
}

export function sameInstant(a, b) {
  if (a == null || b == null) return false
  const ta = new Date(a).getTime()
  const tb = new Date(b).getTime()
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false
  return ta === tb
}
