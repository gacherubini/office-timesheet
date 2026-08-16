import { describe, it, expect } from 'vitest'
import { validarArgs } from '../../../lib/agent/tools/validarArgs.js'
import { TODAS } from '../../../lib/agent/tools/catalog.js'

const schema = (properties, extra = {}) => ({
  type: 'object',
  properties,
  additionalProperties: false,
  ...extra,
})

describe('validarArgs — o que o modelo mandou cabe no que a tool declarou', () => {
  it('argumentos corretos passam', () => {
    const s = schema({ periodo: { type: 'string', enum: ['hoje', 'semana', 'mes'] } })
    expect(validarArgs(s, { periodo: 'mes' })).toEqual({ ok: true })
  })

  it('objeto vazio passa quando nada é obrigatório', () => {
    expect(validarArgs(schema({ periodo: { type: 'string' } }), {})).toEqual({ ok: true })
  })

  // A guarda que importa: com additionalProperties:false, campo que a tool não
  // declarou não pode entrar. É por aí que uma chamada sequestrada tentaria
  // carregar carga extra para dentro da execução.
  it('campo não declarado é recusado', () => {
    const r = validarArgs(schema({ periodo: { type: 'string' } }), { periodo: 'mes', user_id: 'outro' })
    expect(r.ok).toBe(false)
    expect(r.erro).toMatch(/user_id/)
  })

  it('campo extra passa quando o schema permite', () => {
    const s = { type: 'object', properties: { a: { type: 'string' } }, additionalProperties: true }
    expect(validarArgs(s, { a: 'x', b: 1 })).toEqual({ ok: true })
  })

  it('valor fora do enum é recusado, e o erro lista o que vale', () => {
    const s = schema({ periodo: { type: 'string', enum: ['hoje', 'semana', 'mes'] } })
    const r = validarArgs(s, { periodo: 'ontem' })
    expect(r.ok).toBe(false)
    expect(r.erro).toMatch(/periodo/)
    expect(r.erro).toMatch(/hoje/)
  })

  it('tipo errado é recusado', () => {
    const r = validarArgs(schema({ valor: { type: 'number' } }), { valor: 'cem' })
    expect(r.ok).toBe(false)
    expect(r.erro).toMatch(/valor/)
  })

  it('número em string não é aceito por conveniência — schema é contrato', () => {
    expect(validarArgs(schema({ valor: { type: 'number' } }), { valor: '100' }).ok).toBe(false)
  })

  it('booleano falso é valor válido, não ausência', () => {
    expect(validarArgs(schema({ ativo: { type: 'boolean' } }), { ativo: false })).toEqual({ ok: true })
  })

  it('array de string aceita lista de string e recusa lista mista', () => {
    const s = schema({ nomes: { type: 'array', items: { type: 'string' } } })
    expect(validarArgs(s, { nomes: ['ana', 'bia'] })).toEqual({ ok: true })
    expect(validarArgs(s, { nomes: ['ana', 3] }).ok).toBe(false)
  })

  it('array de objeto não inspeciona o item — a tool valida o resto', () => {
    const s = schema({ linhas: { type: 'array', items: { type: 'object' } } })
    expect(validarArgs(s, { linhas: [{ a: 1 }] })).toEqual({ ok: true })
  })

  it('obrigatório ausente é recusado', () => {
    const s = schema({ titulo: { type: 'string' } }, { required: ['titulo'] })
    const r = validarArgs(s, {})
    expect(r.ok).toBe(false)
    expect(r.erro).toMatch(/titulo/)
  })

  it('null num campo opcional passa — é ausência declarada', () => {
    expect(validarArgs(schema({ projeto: { type: 'string' } }), { projeto: null })).toEqual({ ok: true })
  })

  it('sem schema de parâmetros, nada a validar', () => {
    expect(validarArgs(undefined, { qualquer: 'coisa' })).toEqual({ ok: true })
  })

  it('args que não são objeto são recusados', () => {
    expect(validarArgs(schema({}), 'string solta').ok).toBe(false)
  })

  // A mensagem tem como destinatário o MODELO, não o usuário: ela precisa
  // dizer o que corrigir, porque volta pro laço como resultado de tool.
  it('o erro nomeia o campo, diz o que vale e o que veio — dá pra corrigir sozinho', () => {
    const s = schema({ periodo: { type: 'string', enum: ['hoje'] } })
    const erro = validarArgs(s, { periodo: 'ontem' }).erro
    expect(erro).toContain('periodo') // qual campo
    expect(erro).toContain('hoje')    // o que vale
    expect(erro).toContain('ontem')   // o que veio
  })
})

describe('todas as tools do catálogo passam no próprio schema com args vazios', () => {
  // Se uma tool declara `required` mas o laço a chama sem argumentos, o erro
  // tem que vir daqui (legível) e não de um crash lá dentro.
  it('nenhuma tool sem required quebra com {}', () => {
    const quebradas = TODAS
      .filter((t) => !(t.definition.function.parameters?.required?.length))
      .filter((t) => !validarArgs(t.definition.function.parameters, {}).ok)
      .map((t) => t.definition.function.name)
    expect(quebradas).toEqual([])
  })
})
