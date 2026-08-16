// Regras de um bônus, fora da rota porque têm dois leitores: o POST/PUT
// /admin/bonuses e as tools de escrita do agente. Duas cópias divergiriam
// na primeira mudança, e o agente passaria a propor o que a rota recusa
// (ou vice-versa).

export function parseBonusPayload(body) {
  const userId = body.user_id?.trim()
  const title = body.title?.trim()
  const description = body.description?.trim() || null
  const amount = Number(body.amount)
  const bonusDate = body.bonus_date

  if (!userId) return { error: 'user_id é obrigatório.' }
  if (!title) return { error: 'Título é obrigatório.' }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'Valor do bônus deve ser maior que zero.' }
  }
  if (!bonusDate || Number.isNaN(new Date(`${bonusDate}T00:00:00`).getTime())) {
    return { error: 'Data do bônus inválida.' }
  }

  return {
    data: {
      user_id: userId,
      title,
      description,
      amount: Number(amount.toFixed(2)),
      bonus_date: bonusDate,
    },
  }
}
