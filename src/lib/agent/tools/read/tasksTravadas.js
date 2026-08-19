// Espelha GET /tasks (requireAuth, sem recorte por papel): "travada" agora usa
// DOIS sinais, não um só.
//
// 1) `blocked` ("Falta info" no quadro) é travada POR DEFINIÇÃO — é o status
//    que a pessoa escolhe quando a tarefa está esperando terceiro (cliente,
//    topografia, prefeitura). Antes da migration 046 esse motivo não existia
//    como dado; a tool só podia INFERIR travamento por dias parada. Com o
//    status explícito, toda tarefa `blocked` entra na lista mesmo que tenha
//    mudado de status ontem — não faz sentido esperar N dias para acreditar
//    no que a própria pessoa já marcou.
// 2) Dias parada em `in_review` continua sendo INFERÊNCIA, e continua valendo:
//    é um sinal diferente (revisão emperrada, não terceiro travando) que
//    `blocked` não cobre. Abandonada continua entrando sempre, como antes.
//
// dias_parada usa updated_at como aproximação de "sem mexer desde"; para as
// `blocked` ele mostra há quanto tempo a tarefa está naquele estado (mesma
// coluna, sem filtro de N dias — blocked não precisa de prazo para ser sinalizada).
import { query } from '../../../db.js'

const definition = {
  type: 'function',
  function: {
    name: 'tasks_travadas',
    description: 'Tarefas travadas: em "Falta info" (blocked, travada por definição — esperando terceiro), em revisão (in_review) há mais de N dias, ou abandonadas. Use para achar o que está preso no fluxo.',
    parameters: {
      type: 'object',
      properties: { dias: { type: 'number', description: 'limite de dias em revisão; padrão 3 (não se aplica a "Falta info", que entra sempre)' } },
      additionalProperties: false,
    },
  },
}

async function run(_profile, args) {
  // Coage args.dias pra número: um "5" stringificado (ex.: vindo de um cliente
  // JSON menos estrito) não deve cair silenciosamente no padrão.
  const n = Number(args?.dias)
  const dias = Number.isFinite(n) && n > 0 ? Math.floor(n) : 3
  const { rows } = await query(
    `SELECT t.id AS tarefa_id, p.id AS projeto_id,
            t.title AS titulo, p.name AS projeto, t.status,
            EXTRACT(DAY FROM now() - t.updated_at)::int AS dias_parada
       FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE t.status = 'abandoned'
         OR t.status = 'blocked'
         OR (t.status = 'in_review' AND t.updated_at < now() - ($1 || ' days')::interval)
      ORDER BY t.updated_at ASC`,
    [String(dias)],
  )
  return { data: rows, count: rows.length }
}

export default {
  kind: 'read', espelha: 'GET /tasks',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, run,
}
