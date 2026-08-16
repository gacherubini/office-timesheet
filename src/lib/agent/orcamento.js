// Teto de gasto por usuário por dia.
//
// O comentário do guards.js era honesto: "o gasto agregado é observado, não
// bloqueado". Havia teto por requisição, nenhum por pessoa — e uma conta
// comprometida, um loop de uso ou alguém curioso viravam fatura descoberta só
// depois, no painel. Isto é a checagem que faltava, antes da chamada ao modelo.
//
// O teto vale por omissão: sem env configurada, US$ 1,00/dia por pessoa. Com os
// preços do Flash off-peak isso é uso muito pesado, então não atrapalha ninguém
// de verdade — mas fecha a torneira antes de virar prejuízo. Para desligar é
// preciso dizer `off` em voz alta.
import { query } from '../db.js'

const DEFAULT_USD = 1

export function tetoDiarioUsd() {
  const bruto = (process.env.AGENT_DAILY_BUDGET_USD || '').trim().toLowerCase()
  if (!bruto) return DEFAULT_USD
  if (bruto === 'off' || bruto === 'none') return null
  const n = Number(bruto)
  // Lixo na env cai no default: desligar o teto sem querer é o pior desfecho.
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_USD
}

// Gasto de hoje (fuso de São Paulo, o mesmo do resumoDoMes). Linha com
// custo_usd null — preços não configurados — não conta: sem preço o custo é
// desconhecido, não zero, e barrar por desconhecimento seria pior.
export async function gastoDoDia(userId) {
  if (!userId) return 0
  const { rows } = await query(
    `SELECT COALESCE(SUM(custo_usd), 0)::float8 AS total
       FROM agent_usage
      WHERE user_id = $1
        AND created_at >= (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')) AT TIME ZONE 'America/Sao_Paulo'`,
    [userId],
  )
  return Number(rows[0].total)
}

export async function estourouOrcamento(userId) {
  const teto = tetoDiarioUsd()
  if (teto === null) return { estourou: false, gasto: null, teto: null }
  // Sem id (chamada de teste do laço) não há como contar — não barra.
  if (!userId) return { estourou: false, gasto: 0, teto }
  const gasto = await gastoDoDia(userId)
  return { estourou: gasto >= teto, gasto, teto }
}
