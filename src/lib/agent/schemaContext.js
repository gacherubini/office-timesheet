// Esquema do banco entregue ao modelo para escrever SQL em `consultar_dados`.
// Derivado do CATÁLOGO do banco (information_schema) — fonte da verdade, reflete
// o que está realmente deployado — e recortado nas MESMAS tabelas da allowlist do
// guard. Um MD escrito à mão desatualizaria a cada migration; isto não.
//
// Cacheado no processo: o esquema só muda em deploy (as migrations rodam no boot),
// então uma leitura por processo basta. Injetado no prompt só para admin (§8.2), a
// única fatia que enxerga `consultar_dados`.
import { query } from '../db.js'
import { TABELAS_PERMITIDAS } from './tools/sql/guard.js'

let cache = null

export function _resetCacheEsquema() { cache = null } // hook de teste

export async function esquemaAdmin() {
  if (cache !== null) return cache
  cache = await carregar()
  return cache
}

// Encurta os tipos do Postgres para o prompt não inchar: o modelo só precisa da
// classe do tipo (texto/número/data), não da grafia longa do catálogo.
function tipoCurto(t) {
  const m = {
    'timestamp with time zone': 'timestamptz',
    'timestamp without time zone': 'timestamp',
    'character varying': 'text',
    'double precision': 'float',
    integer: 'int',
    boolean: 'bool',
    numeric: 'numeric',
    uuid: 'uuid',
    date: 'date',
    text: 'text',
    jsonb: 'jsonb',
  }
  return m[t] || t
}

async function carregar() {
  const tabelas = [...TABELAS_PERMITIDAS]

  const { rows: cols } = await query(
    `SELECT table_name, column_name, data_type, udt_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1)
      ORDER BY table_name, ordinal_position`,
    [tabelas],
  )

  // Valores dos enums: colunas de status/role/priority vêm como 'USER-DEFINED' no
  // information_schema, o que é inútil para o modelo. Os rótulos reais ('active',
  // 'approved'…) são o que ele precisa para filtrar — filtro por status é a query
  // mais comum. Lidos do pg_enum, também da fonte da verdade.
  const { rows: enums } = await query(
    `SELECT t.typname, e.enumlabel
       FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
      ORDER BY t.typname, e.enumsortorder`,
  )
  const valoresEnum = new Map()
  for (const r of enums) {
    if (!valoresEnum.has(r.typname)) valoresEnum.set(r.typname, [])
    valoresEnum.get(r.typname).push(r.enumlabel)
  }

  // FKs entre tabelas do domínio: o modelo precisa disso para os JOINs. Só as que
  // ligam duas tabelas da allowlist (origem E destino), senão vaza estrutura de fora.
  const { rows: fks } = await query(
    `SELECT tc.table_name AS src, kcu.column_name AS src_col,
            ccu.table_name AS ref, ccu.column_name AS ref_col
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
        AND tc.table_name = ANY($1) AND ccu.table_name = ANY($1)
      ORDER BY tc.table_name, kcu.column_name`,
    [tabelas],
  )

  const porTabela = new Map()
  for (const c of cols) {
    if (!porTabela.has(c.table_name)) porTabela.set(c.table_name, [])
    const vals = c.data_type === 'USER-DEFINED' ? valoresEnum.get(c.udt_name) : null
    const tipo = vals ? `enum(${vals.join('|')})` : tipoCurto(c.data_type)
    porTabela.get(c.table_name).push(`${c.column_name} ${tipo}`)
  }

  const linhasTabelas = [...porTabela.entries()].map(([t, cs]) => `- **${t}**: ${cs.join(', ')}`)
  const linhasFk = fks.map((f) => `- ${f.src}.${f.src_col} → ${f.ref}.${f.ref_col}`)

  return [
    '# Esquema do banco (para consultar_dados)',
    'Estrutura REAL lida do banco. Use exatamente estes nomes de tabela e coluna ao escrever SQL; não invente colunas.',
    '',
    '## Tabelas e colunas',
    ...linhasTabelas,
    '',
    '## Relacionamentos (foreign keys)',
    ...linhasFk,
  ].join('\n')
}
