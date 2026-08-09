// Espelha GET /vacation-calendar (requireAuth): férias aprovadas que tocam o
// período. Além de listar, detecta sobreposições (duas pessoas fora ao mesmo
// tempo) — comparação de pares em JS, barata para o volume de um estúdio.
import { query } from '../../../db.js'
import { resolvePeriodo, formatDateBR } from '../../format.js'

const definition = {
  type: 'function',
  function: {
    name: 'ferias_e_conflitos',
    description: 'Férias aprovadas no período e sobreposições (duas ou mais pessoas de férias ao mesmo tempo). Use para planejar cobertura.',
    parameters: {
      type: 'object',
      properties: { periodo: { type: 'string', enum: ['hoje', 'semana', 'mes'] } },
      additionalProperties: false,
    },
  },
}

function sobrepoe(a, b) {
  return a.inicio <= b.fim && b.inicio <= a.fim
}

// node-postgres devolve `date` como Date (meia-noite UTC) ou, dependendo do
// parser configurado, como string. Em ambos os casos os primeiros 10
// caracteres da forma ISO bastam como chave comparável e determinística
// (independe do fuso do host rodando o processo).
function toISODate(d) {
  return typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10)
}

async function run(_profile, args) {
  const { inicio, fim } = resolvePeriodo(args?.periodo || 'mes')
  const { rows } = await query(
    `SELECT u.name AS pessoa, v.start_date AS inicio, v.end_date AS fim, v.days_count AS dias
       FROM vacation_requests v JOIN users u ON u.id = v.user_id
      WHERE v.status = 'approved'
        AND v.start_date <= $2::date AND v.end_date >= $1::date
      ORDER BY v.start_date ASC`,
    [inicio, fim],
  )
  // Mantém as datas comparáveis (ISO) separadas das formatadas pro humano: a
  // sobreposição precisa comparar YYYY-MM-DD, não dd/mm/aaaa — comparação
  // lexicográfica de dd/mm/aaaa erra mês e ano.
  const registros = rows.map((r) => ({
    pessoa: r.pessoa,
    inicio: toISODate(r.inicio),
    fim: toISODate(r.fim),
    inicioFmt: formatDateBR(r.inicio),
    fimFmt: formatDateBR(r.fim),
    dias: r.dias,
  }))
  const conflitos = []
  for (let i = 0; i < registros.length; i++) {
    for (let j = i + 1; j < registros.length; j++) {
      if (sobrepoe(registros[i], registros[j])) {
        conflitos.push({ pessoa_a: registros[i].pessoa, pessoa_b: registros[j].pessoa })
      }
    }
  }
  const ferias = registros.map((r) => ({ pessoa: r.pessoa, inicio: r.inicioFmt, fim: r.fimFmt, dias: r.dias }))
  return { data: { ferias, conflitos }, count: ferias.length }
}

export default {
  kind: 'read', espelha: 'GET /vacation-calendar',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, run,
}
