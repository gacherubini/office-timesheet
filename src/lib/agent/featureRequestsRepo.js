// Backlog de pedidos não atendidos (tabela agent_feature_requests). Escrito pela
// tool registrar_pedido_nao_atendido; lido/triado pela rota admin.
import { query } from '../db.js'

export const STATUS_VALIDOS = ['novo', 'triado', 'feito', 'descartado']

export async function insert({ userId, role, descricao, textoOriginal = null }) {
  const { rows } = await query(
    `INSERT INTO agent_feature_requests (user_id, role, descricao, texto_original)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId ?? null, role ?? null, descricao, textoOriginal],
  )
  return rows[0]
}

export async function listar() {
  const { rows } = await query(
    `SELECT fr.id, fr.descricao, fr.texto_original, fr.role, fr.status, fr.created_at,
            u.name AS user_name
       FROM agent_feature_requests fr
       LEFT JOIN users u ON u.id = fr.user_id
      ORDER BY fr.created_at DESC`,
  )
  return rows
}

export async function atualizarStatus(id, status) {
  const { rows } = await query(
    `UPDATE agent_feature_requests SET status = $2 WHERE id = $1
     RETURNING id, descricao, texto_original, role, status, created_at`,
    [id, status],
  )
  return rows[0] || null
}
