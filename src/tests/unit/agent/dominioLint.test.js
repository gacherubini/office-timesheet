import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { TABELAS_PERMITIDAS } from '../../../lib/agent/tools/sql/guard.js'
import { buildRegistry } from '../../../lib/agent/tools/registry.js'

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

// O prompt e o registry contam a mesma história ou o assistente fica inútil de
// um jeito difícil de notar. O employee.md afirmava "Não há informação
// financeira disponível para você" enquanto `meus_bonus` e
// `simulacao_performance` estavam no registry do colaborador entregando o
// dinheiro DELE — o assistente recusava pergunta legítima sobre o próprio
// ganho, que a pessoa já vê na tela de performance.
//
// É a mesma classe de desalinhamento do vazamento de horas, invertida: lá o
// prompt prometia menos recorte do que o SQL fazia; aqui promete menos
// capacidade do que o registry tem.
describe('lint do domínio: o prompt não nega o que o registry entrega', () => {
  const colaborador = { id: '00000000-0000-4000-8000-000000000000', role: 'employee' }

  it('colaborador tem tools do próprio dinheiro', () => {
    const reg = buildRegistry(colaborador)
    expect(reg.get('meus_bonus'), 'meus_bonus deveria estar no registry do employee').toBeDefined()
    expect(reg.get('simulacao_performance'), 'simulacao_performance deveria estar no registry do employee').toBeDefined()
  })

  it('employee.md não faz negação geral de informação financeira', () => {
    const md = readFileSync(join(DOMINIO, 'employee.md'), 'utf8')
    expect(
      md,
      'o colaborador tem meus_bonus e simulacao_performance; negar dinheiro em bloco faz o assistente recusar pergunta sobre o ganho da própria pessoa',
    ).not.toMatch(/não há informação financeira/i)
  })

  it('employee.md continua barrando dinheiro de terceiro', () => {
    const md = readFileSync(join(DOMINIO, 'employee.md'), 'utf8')
    // Corrigir a negação geral não pode virar permissão geral: o recorte de
    // "o seu, sim / dos outros, não" precisa continuar escrito.
    expect(md).toMatch(/não/i)
    expect(md.toLowerCase()).toContain('outra pessoa')
  })
})
