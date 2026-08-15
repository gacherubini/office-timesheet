// Regras de uma solicitação de despesa, fora da rota porque têm dois leitores:
// o POST /me/expense-requests e a tool propor_lancar_despesa do agente. Duas
// cópias divergiriam na primeira mudança, e o agente passaria a propor o que a
// rota recusa (ou vice-versa).

export function parseExpensePayload(body) {
  const title = body.title?.trim()
  const description = body.description?.trim() || null
  const amount = Number(body.amount)
  const expenseDate = body.expense_date

  if (!title) {
    return { error: 'Título é obrigatório.' }
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'Valor da despesa deve ser maior que zero.' }
  }

  if (!expenseDate || Number.isNaN(new Date(`${expenseDate}T00:00:00`).getTime())) {
    return { error: 'Data da despesa inválida.' }
  }

  return {
    data: {
      title,
      description,
      amount: Number(amount.toFixed(2)),
      expense_date: expenseDate,
    },
  }
}
