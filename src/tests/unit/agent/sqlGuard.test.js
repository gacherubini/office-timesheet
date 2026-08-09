import { describe, it, expect } from 'vitest'
import { validarESanitizar, SqlRecusado, TABELAS_PERMITIDAS } from '../../../lib/agent/tools/sql/guard.js'

describe('guard do SQL restrito', () => {
  it('aceita um SELECT numa tabela da allowlist e força LIMIT', () => {
    const { sql, tabelas } = validarESanitizar('SELECT id, name FROM users')
    expect(sql).toMatch(/LIMIT \d+/i)
    expect(sql).toMatch(/from \(/i) // envelopado
    expect(tabelas).toContain('users')
  })

  it('rejeita INSERT/UPDATE/DELETE', () => {
    for (const q of [
      `INSERT INTO users (name) VALUES ('x')`,
      `UPDATE users SET name = 'x'`,
      `DELETE FROM users`,
    ]) {
      expect(() => validarESanitizar(q)).toThrow(SqlRecusado)
    }
  })

  it('rejeita DDL (DROP/ALTER/CREATE)', () => {
    for (const q of ['DROP TABLE users', 'ALTER TABLE users ADD c int', 'CREATE TABLE t (a int)']) {
      expect(() => validarESanitizar(q)).toThrow(SqlRecusado)
    }
  })

  it('rejeita múltiplos statements encadeados por ;', () => {
    expect(() => validarESanitizar('SELECT 1; DROP TABLE users')).toThrow(SqlRecusado)
  })

  it('rejeita CTE que escreve (WITH ... INSERT/UPDATE/DELETE)', () => {
    const q = `WITH x AS (DELETE FROM users RETURNING id) SELECT * FROM x`
    expect(() => validarESanitizar(q)).toThrow(SqlRecusado)
  })

  it('rejeita tabela fora da allowlist', () => {
    expect(() => validarESanitizar('SELECT * FROM notifications')).toThrow(/allowlist/i)
    expect(TABELAS_PERMITIDAS.has('notifications')).toBe(false)
  })

  it('rejeita lixo que não parseia como SELECT', () => {
    expect(() => validarESanitizar('não é sql')).toThrow(SqlRecusado)
  })

  it('aceita CTE de leitura (o alias não é tabela fora da allowlist)', () => {
    const { tabelas } = validarESanitizar(
      `WITH ativos AS (SELECT id, name FROM projects WHERE status = 'active')
       SELECT name FROM ativos`,
    )
    expect(tabelas).toContain('projects')
    expect(tabelas).not.toContain('ativos')
  })

  it('rejeita consulta sem tabela alguma (só chamada de função)', () => {
    expect(() => validarESanitizar('SELECT pg_sleep(9)')).toThrow(/ao menos uma tabela/i)
    expect(() => validarESanitizar('SELECT 1')).toThrow(SqlRecusado)
  })

  it('envelopa sem deixar comentário final engolir o LIMIT', () => {
    const { sql } = validarESanitizar('SELECT id FROM users -- só os ids')
    // O `--` tem de morrer no fim da própria linha, antes do `)` e do LIMIT.
    expect(sql).toMatch(/--[^\n]*\n\) AS _agente_sub LIMIT \d+/)
  })

  it('allowlist cobre as tabelas de colaboração que o domínio anuncia', () => {
    for (const t of ['task_comments', 'task_attachments', 'task_activity']) {
      expect(TABELAS_PERMITIDAS.has(t)).toBe(true)
    }
  })
})
