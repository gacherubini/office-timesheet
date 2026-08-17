// Espelha GET /projects (projects.js:30, requireAuth) + GET /tasks/counts
// (projectManagement.js:145, requireAuth) — ambos sem recorte por papel. Retrato
// de um projeto (ou de todos os ativos): status, tarefas por coluna do kanban e
// horas apontadas. project_status só tem dois valores (002_enums.sql): 'active'
// e 'completed'. LATERAL para não inflar horas/contagens (fan-out).
// O filtro é por NOME (o modelo não tem uuid nenhum), mas o id sai no resultado
// para encadear com andamento_de_projeto.
// Com `periodo`, as horas passam a ser só as da janela — absorve o
// horas_por_projeto do §8.1 sem abrir tool separada.
// RECORTE POR LINHA nas horas: quem não tem acesso a operações vê só o que ELE
// apontou no projeto. O agregado do time não é "coluna financeira" (por isso
// escapou do paridadeColuna), mas é dado de outras pessoas do mesmo jeito — e
// não pode nem CHEGAR ao modelo: se o número do time entra no contexto, ele
// aparece na conversa por mais que o rótulo mude. Por isso o recorte é no SQL e
// a chave muda de nome (`minhas_horas`), não só o texto.
import { query } from '../../../db.js'
import { canAccessOperations } from '../../../permissions.js'
import { resolvePeriodo } from '../../format.js'
import { resolverProjeto } from '../projetos.js'

const definition = {
  type: 'function',
  function: {
    name: 'status_projeto',
    description: 'Retrato de um projeto (ou de todos os ativos): status (active/completed), tarefas por coluna do kanban (todo, in_progress, in_review, done, abandoned) e horas apontadas. Passe o nome do projeto para um projeto específico. Com periodo, as horas são só as da janela. As horas vêm no campo que diz DE QUEM elas são: `total_horas` (tudo que o time apontou no projeto) ou `minhas_horas` (só o que a pessoa que está falando apontou) — o campo `escopo_horas` repete isso. Descreva o número exatamente como o campo diz; nunca chame `minhas_horas` de total do projeto.',
    parameters: {
      type: 'object',
      properties: {
        projeto: { type: 'string', description: 'nome do projeto; se omitido, traz todos os projetos ativos' },
        periodo: { type: 'string', enum: ['hoje', 'semana', 'mes'], description: 'recorta as horas apontadas ao período; se omitido, traz o acumulado do projeto' },
      },
      additionalProperties: false,
    },
  },
}

async function run(profile, args) {
  const alvo = (args?.projeto || '').trim()
  const id = alvo ? (await resolverProjeto(alvo)).id : null
  // Sem período, o LATERAL soma a vida inteira do projeto (os dois $ ficam
  // nulos e as duas condições viram verdade).
  const janela = args?.periodo ? resolvePeriodo(args.periodo) : null
  // $4 diz se o recorte está ligado e $5 de quem são as linhas. Separados de
  // propósito: com um id nulo, `user_id = NULL` é falso e a soma dá zero — sem
  // perfil o recorte falha FECHADO, em vez de virar o agregado do time.
  const equipe = canAccessOperations(profile)

  const { rows } = await query(
    `SELECT p.id AS projeto_id, p.name AS projeto, COALESCE(c.name, p.client) AS cliente, p.status,
            tc.todo, tc.in_progress, tc.in_review, tc.done, tc.abandoned, tc.total_tarefas,
            COALESCE(hc.total_minutes, 0) AS total_minutes
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS total_tarefas,
                COUNT(*) FILTER (WHERE status = 'todo')::int        AS todo,
                COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
                COUNT(*) FILTER (WHERE status = 'in_review')::int   AS in_review,
                COUNT(*) FILTER (WHERE status = 'done')::int        AS done,
                COUNT(*) FILTER (WHERE status = 'abandoned')::int   AS abandoned
           FROM tasks WHERE project_id = p.id
       ) tc ON true
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(duration_minutes),0)::int AS total_minutes
           FROM time_entries
          WHERE project_id = p.id AND status = 'completed'
            AND ($2::timestamp IS NULL OR started_at >= ($2::timestamp AT TIME ZONE 'America/Sao_Paulo'))
            AND ($3::date IS NULL OR started_at < (($3::date + interval '1 day')::timestamp AT TIME ZONE 'America/Sao_Paulo'))
            AND (NOT $4::boolean OR user_id = $5::uuid)
       ) hc ON true
      WHERE p.deleted_at IS NULL
        AND ($1::uuid IS NULL OR p.id = $1::uuid)
        AND ($1::uuid IS NOT NULL OR p.status = 'active')
      ORDER BY p.name`,
    [id, janela?.inicio ?? null, janela?.fim ?? null, !equipe, profile?.id ?? null],
  )
  const data = rows.map((r) => {
    const horas = Number((r.total_minutes / 60).toFixed(2))
    return {
      projeto_id: r.projeto_id,
      projeto: r.projeto,
      cliente: r.cliente || null,
      status: r.status,
      periodo: janela,
      tarefas: {
        todo: r.todo, in_progress: r.in_progress, in_review: r.in_review,
        done: r.done, abandoned: r.abandoned, total: r.total_tarefas,
      },
      escopo_horas: equipe ? 'equipe' : 'proprio',
      // Chave diferente, não só rótulo diferente: `total_horas` num JSON é lido
      // pelo modelo como "o total do projeto" mesmo que o texto diga outra coisa.
      ...(equipe ? { total_horas: horas } : { minhas_horas: horas }),
    }
  })
  return { data, count: data.length }
}

export default {
  kind: 'read', espelha: 'GET /projects + GET /tasks/counts',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, run,
}
