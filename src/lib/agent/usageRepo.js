// Persistência do uso do agente (tabela agent_usage). Encapsula as queries que o
// loop (insert por chamada) e a rota de custos (resumoDoMes) precisam. Custo é
// calculado na hora do insert, a partir dos preços de env vigentes — linhas
// antigas não são recalculadas quando os preços mudam.
import { query } from '../db.js'
import { custoDeUso } from './audit.js'

export async function insert({ profile, model, tokensIn = 0, tokensOut = 0, cached = 0, status = 'ok' }) {
  const custo = custoDeUso({ tokensIn, tokensOut, cached })
  // users.id é uuid. Testes unitários do loop usam { id: 1 }; um número aqui
  // quebraria o INSERT e, pior, o turno do agente. Sem string, user_id fica null.
  const userId = typeof profile?.id === 'string' ? profile.id : null
  await query(
    `INSERT INTO agent_usage (user_id, model, tokens_in, tokens_out, tokens_cached, custo_usd, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, model ?? null, tokensIn, tokensOut, cached, custo, status],
  )
}

export async function resumoDoMes() {
  const { rows } = await query(
    `SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS dia,
            SUM(tokens_in)::bigint  AS tokens_in,
            SUM(tokens_out)::bigint AS tokens_out,
            SUM(custo_usd)          AS custo_usd
       FROM agent_usage
      WHERE created_at >= (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')) AT TIME ZONE 'America/Sao_Paulo'
      GROUP BY dia
      ORDER BY dia`,
  )
  const porDia = rows.map((r) => ({
    dia: r.dia,
    tokensIn: Number(r.tokens_in),
    tokensOut: Number(r.tokens_out),
    custoUsd: r.custo_usd === null ? null : Number(r.custo_usd),
  }))
  const comCusto = porDia.filter((d) => d.custoUsd !== null)
  const totalUsd = comCusto.length ? comCusto.reduce((s, d) => s + d.custoUsd, 0) : null
  return { totalUsd, porDia }
}
