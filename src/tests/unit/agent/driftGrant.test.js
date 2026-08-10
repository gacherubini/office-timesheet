import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { TABELAS_PERMITIDAS } from '../../../lib/agent/tools/sql/guard.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const MIGR = join(HERE, '..', '..', '..', 'migrations')

// Extrai as tabelas de todo `GRANT SELECT ON <lista> TO agent_readonly` do SQL.
// Determinístico, sem banco: parseia o TEXTO das migrations (não roda nada).
function tabelasConcedidas(sql) {
  const tabelas = new Set()
  const re = /GRANT\s+SELECT\s+ON\s+([\s\S]*?)\s+TO\s+agent_readonly/gi
  let m
  while ((m = re.exec(sql))) {
    for (const parte of m[1].split(',')) {
      const t = parte.trim()
      if (t) tabelas.add(t)
    }
  }
  return tabelas
}

describe('drift GRANT ↔ allowlist (guard.js vs migrations 030/031)', () => {
  it('TABELAS_PERMITIDAS é exatamente o conjunto concedido a agent_readonly', () => {
    const sql030 = readFileSync(join(MIGR, '030_agent_readonly_role.sql'), 'utf8')
    const sql031 = readFileSync(join(MIGR, '031_agent_readonly_grants.sql'), 'utf8')
    const concedidas = new Set([...tabelasConcedidas(sql030), ...tabelasConcedidas(sql031)])

    const soNaAllowlist = [...TABELAS_PERMITIDAS].filter((t) => !concedidas.has(t))
    const soNoGrant = [...concedidas].filter((t) => !TABELAS_PERMITIDAS.has(t))

    expect(soNaAllowlist, `na allowlist mas SEM GRANT (o guard permitiria, o banco negaria): ${soNaAllowlist.join(', ')}`).toEqual([])
    expect(soNoGrant, `com GRANT mas FORA da allowlist (o guard recusaria à toa): ${soNoGrant.join(', ')}`).toEqual([])
  })
})
