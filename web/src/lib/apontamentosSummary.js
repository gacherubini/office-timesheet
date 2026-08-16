// Rótulos da soma em /admin/time-entries. A conta é horas de horista +
// despesas aprovadas + bônus. Salário fixo (estagiário) não entra.

export const HORAS_LABEL = 'Custo das horas (horistas)'
export const NET_LABEL = 'Horas + despesas + bônus'

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function fixedSalaryNote(user) {
  const amount = Number(user?.fixed_salary) || 0
  if (amount <= 0) return null
  return `Salário fixo cadastrado: ${formatCurrency(amount)} (não entra nesta soma)`
}
