import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { TABELAS_PERMITIDAS } from '../../../lib/agent/tools/sql/guard.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const DOMINIO = join(HERE, '..', '..', '..', 'lib', 'agent', 'context', 'dominio')

// Limitação DOCUMENTADA: em vez de tentar adivinhar qualquer token de código
// (backticks pegam tool/coluna/keyword: `consultar_dados`, `cost_snapshot`,
// `LIMIT`...), varremos só as DECLARAÇÕES de entidade — o padrão de definição
// dos arquivos de domínio: um termo em negrito seguido de espaço + travessão
// (`**tabela** — descrição`). Isso capta inequivocamente os nomes anunciados
// como tabela e ignora glossário (`**apontamento**:`) e capacidades
// (`**status do projeto**:`), que usam `:` ou parênteses.
function tabelasCitadasNoDominio() {
  const re = /\*\*([^*]+?)\*\*\s+—/g
  const ident = /^[a-z][a-z0-9_]*$/
  const citadas = new Set()
  for (const arquivo of readdirSync(DOMINIO).filter((f) => f.endsWith('.md'))) {
    const texto = readFileSync(join(DOMINIO, arquivo), 'utf8')
    let m
    while ((m = re.exec(texto))) {
      for (const parte of m[1].split('/')) {
        const nome = parte.trim()
        if (ident.test(nome)) citadas.add(nome)
      }
    }
  }
  return citadas
}

// Conjunto conhecido = allowlist ∪ tabelas reais do schema (quando há banco).
// Sem banco (ex.: unit isolado), cai só na allowlist — que já é o universo
// consultável e faz o lint valer de qualquer jeito.
async function tabelasConhecidas() {
  const conhecidas = new Set(TABELAS_PERMITIDAS)
  try {
    const { query } = await import('../../helpers/db.js')
    const { rows } = await query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
    for (const r of rows) conhecidas.add(r.table_name)
  } catch {
    // banco indisponível — segue só com a allowlist.
  }
  return conhecidas
}

describe('lint do domínio: toda tabela citada em dominio/*.md é conhecida', () => {
  it('nenhum nome de tabela anunciado fica fora do conjunto conhecido', async () => {
    const citadas = [...tabelasCitadasNoDominio()]
    expect(citadas.length, 'o lint precisa achar ao menos uma tabela declarada').toBeGreaterThan(0)

    const conhecidas = await tabelasConhecidas()
    const desconhecidas = citadas.filter((t) => !conhecidas.has(t))
    expect(desconhecidas, `tabelas citadas no domínio que não existem/não são consultáveis: ${desconhecidas.join(', ')}`).toEqual([])
  })
})
