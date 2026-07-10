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
