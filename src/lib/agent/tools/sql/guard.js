// Defesa em profundidade + UX para o SQL restrito (§8.2). Faz PARSE REAL (AST),
// não regex: regex de allow/deny é enganável (comentários, CTE que escreve,
// union), e allow/deny enganável é finding de segurança. Mas o parser NÃO é a
// fronteira — a fronteira é a role read-only + transação READ ONLY do roPool.
// Aqui garantimos: 1 statement, verbo SELECT, tabelas na allowlist, LIMIT forçado.
// node-sql-parser é CommonJS sem `exports` no package.json: em ESM puro o named
// import não resolve (o app inteiro deixa de subir). Só o default funciona.
import nodeSqlParser from 'node-sql-parser'
import { SQL_LIMITS } from '../../guards.js'

const { Parser } = nodeSqlParser
const parser = new Parser()
const OPT = { database: 'postgresql' }

// Allowlist de TABELA (não de linha/coluna — por isso a tool é admin-only, §8.2).
// Deve espelhar o GRANT SELECT das migrations 030 + 031.
export const TABELAS_PERMITIDAS = new Set([
  'users', 'projects', 'clients', 'suppliers',
  'time_entries', 'time_entry_pauses',
  'tasks', 'task_comments', 'task_attachments', 'task_activity',
  'vacation_requests', 'expense_requests', 'bonuses',
  'presences', 'performance_simulations',
])

export class SqlRecusado extends Error {}

// Nomes das CTEs do próprio SELECT. tableList devolve a CTE como se fosse
// tabela ('select::null::x'), então sem isto todo WITH legítimo cairia na
// allowlist. A CTE não é dado novo: o que ela lê já foi checado nos refs.
function nomesDeCTE(ast) {
  const withs = Array.isArray(ast?.with) ? ast.with : []
  return new Set(withs.map((w) => w?.name?.value || w?.name).filter(Boolean))
}

// Lança SqlRecusado com motivo curto (não vaza interno, §17). Devolve o SQL já
// envelopado com LIMIT e a lista de tabelas referenciadas.
export function validarESanitizar(sqlBruto) {
  const sql = String(sqlBruto || '').trim().replace(/;+\s*$/, '')
  if (!sql) throw new SqlRecusado('consulta vazia')

  let ast
  try {
    ast = parser.astify(sql, OPT)
  } catch {
    throw new SqlRecusado('não consegui interpretar isto como uma consulta SELECT simples')
  }

  // Vários statements viram array; exigimos exatamente um.
  if (Array.isArray(ast)) {
    if (ast.length !== 1) throw new SqlRecusado('envie um único comando SELECT')
    ast = ast[0]
  }
  if (ast.type !== 'select') throw new SqlRecusado('apenas SELECT é permitido')

  // Allowlist via tableList (parse real). Formato: '{op}::{db}::{tabela}'.
  // Qualquer op != select (ex.: insert/update/delete de um CTE que escreve) barra.
  const ctes = nomesDeCTE(ast)
  const refs = parser.tableList(sql, OPT)
  const tabelas = []
  for (const ref of refs) {
    const [op, , tabela] = ref.split('::')
    if (op !== 'select') throw new SqlRecusado('apenas leitura é permitida')
    if (ctes.has(tabela)) continue
    if (!TABELAS_PERMITIDAS.has(tabela)) {
      throw new SqlRecusado(`tabela fora da allowlist: ${tabela}`)
    }
    tabelas.push(tabela)
  }
  // Sem FROM, tableList vem vazio e a allowlist não é exercida — sobraria só
  // chamada de função solta (`SELECT pg_sleep(9)`). A role read-only conteria o
  // estrago, mas aqui a consulta já não tem para que servir: exigimos dado.
  if (tabelas.length === 0) {
    throw new SqlRecusado('a consulta precisa ler ao menos uma tabela do domínio')
  }

  // LIMIT forçado por envelopamento: cap independente de LIMIT interno. As
  // quebras de linha importam: sem elas um `--` no fim do SQL comentaria o
  // fecha-parênteses e o LIMIT.
  const sqlLimitado = `SELECT * FROM (\n${sql}\n) AS _agente_sub LIMIT ${SQL_LIMITS.maxRows}`
  return { sql: sqlLimitado, tabelas }
}
