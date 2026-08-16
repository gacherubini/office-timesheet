// Avaliação das respostas do agente pelos usuários.
//
// É o único sinal que diz "fez, e fez errado" — agent_feature_requests só
// captura "não consigo fazer". Sem isto, troca de modelo degrada em silêncio e
// o eval set não tem de onde crescer.
//
// Motivo é lista fechada de propósito: o objetivo é CONTAR ("quantos
// 'incorreto' esta semana?"), e texto livre não se agrega.

import { query } from '../db.js'

export const MOTIVOS = ['incorreto', 'nao_era_o_que_pedi', 'tom', 'lento', 'seguranca', 'outro']
const RATINGS = ['up', 'down']

export async function registrar({ messageId, userId, rating, motivo = null }) {
  if (!RATINGS.includes(rating)) {
    throw new Error(`rating inválido: ${rating}`)
  }
  // Motivo só existe no negativo. No positivo é sempre null — voltar de down
  // para up tem que LIMPAR o motivo, senão fica órfão de uma avaliação antiga.
  const motivoFinal = rating === 'down' ? (motivo || null) : null
  if (motivoFinal && !MOTIVOS.includes(motivoFinal)) {
    throw new Error(`motivo inválido: ${motivoFinal}`)
  }
  const { rows } = await query(
    `INSERT INTO agent_feedback (message_id, user_id, rating, motivo)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (message_id, user_id)
     DO UPDATE SET rating = EXCLUDED.rating, motivo = EXCLUDED.motivo, updated_at = now()
     RETURNING id, message_id, rating, motivo`,
    [messageId, userId, rating, motivoFinal],
  )
  return rows[0]
}

// A mensagem avaliada tem que pertencer a uma conversa do próprio usuário —
// senão qualquer id de mensagem vira alvo. Devolve o id se pode, null se não.
export async function messageIdDoUsuario(messageId, userId) {
  const { rows } = await query(
    `SELECT m.id
       FROM agent_messages m
       JOIN agent_conversations c ON c.id = m.conversation_id
      WHERE m.id = $1 AND c.user_id = $2 AND m.role = 'assistant'`,
    [messageId, userId],
  )
  return rows[0]?.id ?? null
}

export async function resumo({ desde = null } = {}) {
  const filtro = desde ? 'WHERE created_at >= $1' : ''
  const params = desde ? [desde] : []
  const { rows: totais } = await query(
    `SELECT rating, COUNT(*)::int AS total FROM agent_feedback ${filtro} GROUP BY rating`,
    params,
  )
  const { rows: motivos } = await query(
    `SELECT motivo, COUNT(*)::int AS total
       FROM agent_feedback
      ${desde ? 'WHERE created_at >= $1 AND' : 'WHERE'} motivo IS NOT NULL
      GROUP BY motivo
      ORDER BY total DESC, motivo ASC`,
    params,
  )
  const por = (r) => totais.find((t) => t.rating === r)?.total ?? 0
  return { up: por('up'), down: por('down'), motivos }
}

// Fila de triagem: o negativo com a pergunta e a resposta em volta, para dar
// pra entender o caso sem abrir a conversa inteira.
export async function listarNegativos({ limite = 50 } = {}) {
  const { rows } = await query(
    `SELECT f.id, f.motivo, f.created_at,
            m.content AS resposta,
            (SELECT p.content
               FROM agent_messages p
              WHERE p.conversation_id = m.conversation_id
                AND p.role = 'user' AND p.seq < m.seq
              ORDER BY p.seq DESC LIMIT 1) AS pergunta,
            m.conversation_id
       FROM agent_feedback f
       JOIN agent_messages m ON m.id = f.message_id
      WHERE f.rating = 'down'
      ORDER BY f.created_at DESC
      LIMIT $1`,
    [limite],
  )
  return rows
}
