// Espelha GET /me/simulation (me.js:498, requireAuth, dado PRÓPRIO): lê a simulação
// de performance do mês do próprio usuário (horas PLANEJADAS, em
// performance_simulations) e cruza com as horas REAIS, que vêm sempre vivas de
// time_entries — nunca da tabela de simulação. Cada pessoa só vê a própria
// simulação: o recorte é por linha (user_id = profile.id), igual ao endpoint.
import { query } from '../../../db.js'
import { resolvePeriodo } from '../../format.js'

const YM_RE = /^\d{4}-\d{2}$/

const definition = {
  type: 'function',
  function: {
    name: 'simulacao_performance',
    description: 'Sua simulação de performance do mês: meta de ganho, horas planejadas e horas já realizadas. É sempre a SUA simulação — não dá para ver a de outra pessoa.',
    parameters: {
      type: 'object',
      properties: { mes: { type: 'string', description: 'mês no formato YYYY-MM; padrão é o mês atual' } },
      additionalProperties: false,
    },
  },
}

// Soma os minutos planejados do mapa `overrides` do jsonb salvo. Robusto a
// formato ausente/antigo — cai em zero em vez de estourar.
function planejadoMinutos(planned) {
  const p = planned && typeof planned === 'object' ? planned : {}
  const overrides = p.overrides && typeof p.overrides === 'object' ? p.overrides : {}
  let soma = 0
  for (const v of Object.values(overrides)) if (Number.isFinite(v)) soma += v
  return soma
}

async function run(profile, args) {
  const mes = YM_RE.test(String(args?.mes || '')) ? args.mes : resolvePeriodo('mes').inicio.slice(0, 7)
  const inicio = `${mes}-01`
  // Dia 0 do mês seguinte (0-based) = último dia do mês alvo.
  const fim = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10)

  const sim = await query(
    'SELECT planned FROM performance_simulations WHERE user_id = $1 AND ym = $2',
    [profile.id, mes],
  )
  const planned = sim.rows[0]?.planned || null

  const real = await query(
    `SELECT COALESCE(SUM(duration_minutes),0)::int AS minutos
       FROM time_entries
      WHERE user_id = $1 AND status = 'completed'
        AND started_at >= $2::date AND started_at < ($3::date + interval '1 day')`,
    [profile.id, inicio, fim],
  )

  const data = {
    mes,
    meta_ganho: planned ? Number(planned.target_amount || 0) : 0,
    horas_planejadas: Number((planejadoMinutos(planned) / 60).toFixed(2)),
    horas_realizadas: Number((real.rows[0].minutos / 60).toFixed(2)),
    tem_simulacao: planned != null,
  }
  return { data, count: 1 }
}

export default {
  kind: 'read', espelha: 'GET /me/simulation',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, run,
}
