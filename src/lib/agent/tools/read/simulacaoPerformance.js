// Espelha GET /me/simulation (me.js:498, requireAuth, dado PRÓPRIO): lê a
// simulação de performance do mês do próprio usuário e cruza com as horas
// REAIS, que vêm sempre vivas de time_entries — nunca da tabela de simulação.
// Cada pessoa só vê a própria simulação: o recorte é por linha
// (user_id = profile.id), igual ao endpoint.
//
// O jsonb salvo NÃO guarda as horas planejadas: guarda a META em R$ e os
// ajustes de fim de semana. As horas dos dias úteis são derivadas da meta pelo
// valor/hora da pessoa — mesma conta da tela (lib/performanceSimulation.js).
import { query } from '../../../db.js'
import { resolvePeriodo } from '../../format.js'
import { normalizeSimConfig, planejamentoDoMes } from '../../../performanceSimulation.js'

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

const h = (n) => Number(n.toFixed(2))

async function run(profile, args) {
  const hoje = resolvePeriodo('hoje').inicio
  const mes = YM_RE.test(String(args?.mes || '')) ? args.mes : hoje.slice(0, 7)
  const ano = Number(mes.slice(0, 4))
  const m = Number(mes.slice(5, 7))
  const inicio = `${mes}-01`
  // Dia 0 do mês seguinte (0-based) = último dia do mês alvo.
  const fim = `${mes}-${String(new Date(Date.UTC(ano, m, 0)).getUTCDate()).padStart(2, '0')}`

  const sim = await query(
    'SELECT planned FROM performance_simulations WHERE user_id = $1 AND ym = $2',
    [profile.id, mes],
  )
  const temSimulacao = sim.rows.length > 0
  const config = normalizeSimConfig(sim.rows[0]?.planned)

  // A meta vira horas pelo valor/hora da pessoa — sem ele a conta não fecha.
  const perfil = await query('SELECT hourly_rate FROM users WHERE id = $1', [profile.id])
  const valorHora = Number(perfil.rows[0]?.hourly_rate) || 0

  // Janela no fuso do estúdio, igual ao /me/stats (me.js:343).
  const real = await query(
    `SELECT COALESCE(SUM(duration_minutes),0)::int AS minutos
       FROM time_entries
      WHERE user_id = $1 AND status = 'completed'
        AND started_at >= ($2::date AT TIME ZONE 'America/Sao_Paulo')
        AND started_at < (($3::date + interval '1 day') AT TIME ZONE 'America/Sao_Paulo')`,
    [profile.id, inicio, fim],
  )
  const horasRealizadas = real.rows[0].minutos / 60

  const p = planejamentoDoMes({ mes, hoje, config, horasRealizadas, valorHora })

  const data = {
    mes,
    tem_simulacao: temSimulacao,
    meta_ganho: config.target_amount,
    valor_hora: valorHora,
    horas_realizadas: h(horasRealizadas),
    valor_realizado: h(p.valorRealizado),
    horas_para_bater_a_meta: h(p.horasParaMeta),
    horas_extras_de_fim_de_semana: h(p.horasFimDeSemana),
    horas_planejadas: h(p.horasPlanejadas),
  }
  // Sem valor/hora cadastrado a meta não vira hora nenhuma: avisa em vez de
  // deixar o modelo apresentar "0h planejadas" como se fosse escolha da pessoa.
  if (valorHora <= 0) {
    data.observacao = 'Sem valor por hora cadastrado no perfil, não dá para converter a meta em horas.'
  }
  return { data, count: 1 }
}

export default {
  kind: 'read', espelha: 'GET /me/simulation',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, run,
}
