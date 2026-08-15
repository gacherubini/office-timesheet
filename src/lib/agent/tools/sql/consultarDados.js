// SQL de leitura restrito, ADMIN-ONLY (§8.2). Fluxo: guard (parse + sanitização
// + LIMIT) → roPool (role read-only + transação READ ONLY + statement_timeout).
// espelha:null de propósito — não há endpoint equivalente de "SQL livre"; o
// recorte é a role + a allowlist, não a paridade com uma rota (fora do §18 de
// paridade). O registry filtra por roles:['admin'], então não-admin nunca a vê.
import { validarESanitizar, SqlRecusado } from './guard.js'
import { runReadOnly } from './roPool.js'
import { logger } from '../../../logger.js'

const definition = {
  type: 'function',
  function: {
    name: 'consultar_dados',
    description:
      'Executa uma consulta SQL SELECT somente-leitura sobre as tabelas do domínio, para perguntas ad-hoc que as tools curadas não cobrem. Regras: só SELECT, um único comando, apenas tabelas da allowlist, sem escrita. Use SOMENTE quando nenhuma tool específica servir.',
    parameters: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'uma única consulta SELECT em SQL Postgres' },
      },
      required: ['sql'],
      additionalProperties: false,
    },
  },
}

// Erro do Postgres volta AO MODELO (não ao usuário) quando é recuperável — coluna
// ou tabela errada, sintaxe: com o detalhe cru ("column x does not exist") o modelo
// reescreve o SQL em vez de chutar de novo. Isto NÃO é o oráculo de schema do §17:
// o modelo já recebe o esquema inteiro no prompt (schemaContext) e a tool é
// admin-only; resultado de tool nunca chega ao usuário e as REGRAS proíbem repetir
// SQL/coluna a ele. Permissão e timeout ficam genéricos — o texto cru não ajudaria
// o modelo a se corrigir.
function mensagemCurta(err) {
  if (err?.code === '57014') return 'a consulta demorou demais e foi cancelada; restrinja o período ou os filtros'
  if (err?.code === '42501') return 'sem permissão de leitura nessa tabela'
  if (err?.code?.startsWith?.('42') && err?.message) return err.message
  return 'não consegui executar a consulta'
}

async function run(_profile, args) {
  let sanitizado
  try {
    sanitizado = validarESanitizar(args?.sql)
  } catch (err) {
    if (err instanceof SqlRecusado) throw new Error(`SQL recusado: ${err.message}`)
    throw new Error('SQL recusado')
  }
  try {
    const rows = await runReadOnly(sanitizado.sql)
    return { data: rows, count: rows.length }
  } catch (err) {
    logger.warn(
      { err: { code: err?.code, message: err?.message }, tabelas: sanitizado.tabelas },
      'consultar_dados falhou',
    )
    throw new Error(`SQL falhou: ${mensagemCurta(err)}`)
  }
}

export default { kind: 'read', espelha: null, roles: ['admin'], definition, run }
