import { describe, it, expect } from 'vitest'
import { podeRefazer, podeEditar, limparParaRefazer } from './agentAcoes.js'

const pergunta = (texto) => ({ autor: 'user', texto })
const resposta = (texto, extra = {}) => ({ autor: 'bot', texto, ...extra })

describe('podeRefazer', () => {
  it('a última resposta pode ser refeita', () => {
    const m = [pergunta('quanto custou?'), resposta('R$ 42.310.')]
    expect(podeRefazer(m, 1)).toBe(true)
  })

  // Refazer uma resposta do meio deixaria órfão tudo que veio depois: as bolhas
  // seguintes responderam à versão antiga.
  it('resposta do meio da conversa não pode', () => {
    const m = [pergunta('a'), resposta('1'), pergunta('b'), resposta('2')]
    expect(podeRefazer(m, 1)).toBe(false)
    expect(podeRefazer(m, 3)).toBe(true)
  })

  it('bolha do usuário não é refazível', () => {
    expect(podeRefazer([pergunta('a'), resposta('1')], 0)).toBe(false)
  })

  it('resposta sem pergunta antes não é refazível', () => {
    expect(podeRefazer([resposta('sozinha')], 0)).toBe(false)
  })

  // A proposta antiga continua aprovável enquanto o TTL não vence; refazer
  // criaria uma segunda e daria pra confirmar a errada.
  it('resposta com proposta pendente não pode ser refeita', () => {
    const m = [pergunta('lança um bônus'), resposta('', { proposta: { proposalId: 'p1' } })]
    expect(podeRefazer(m, 1)).toBe(false)
  })

  it('proposta já aprovada também não — o efeito no banco já aconteceu', () => {
    const m = [pergunta('lança'), resposta('', { proposta: { proposalId: 'p1' }, aprovado: true })]
    expect(podeRefazer(m, 1)).toBe(false)
  })

  // O bloco de erro já tem o próprio "Tentar de novo"; dois botões pro mesmo
  // gesto é ruído.
  it('resposta que falhou não ganha refazer — o bloco de erro já tem o dele', () => {
    const m = [pergunta('a'), resposta('', { erro: 'deu ruim' })]
    expect(podeRefazer(m, 1)).toBe(false)
  })

  it('índice fora da lista não estoura', () => {
    expect(podeRefazer([], 0)).toBe(false)
    expect(podeRefazer([pergunta('a')], 7)).toBe(false)
    expect(podeRefazer(undefined, 0)).toBe(false)
  })
})

describe('podeEditar', () => {
  it('a última pergunta pode voltar pro composer', () => {
    const m = [pergunta('a'), resposta('1'), pergunta('b'), resposta('2')]
    expect(podeEditar(m, 2)).toBe(true)
  })

  it('pergunta anterior não', () => {
    const m = [pergunta('a'), resposta('1'), pergunta('b'), resposta('2')]
    expect(podeEditar(m, 0)).toBe(false)
  })

  it('vale mesmo enquanto a resposta ainda não chegou', () => {
    const m = [pergunta('a'), resposta('')]
    expect(podeEditar(m, 0)).toBe(true)
  })

  it('bolha do bot não é editável', () => {
    expect(podeEditar([pergunta('a'), resposta('1')], 1)).toBe(false)
  })

  it('lista vazia ou índice inválido não estoura', () => {
    expect(podeEditar([], 0)).toBe(false)
    expect(podeEditar(undefined, 0)).toBe(false)
  })
})

describe('limparParaRefazer', () => {
  const velha = {
    autor: 'bot',
    texto: 'R$ 42.310.',
    id: 'msg-antiga',
    fontes: [{ rotulo: 'Custo por projeto', detalhe: 'este mês', count: 14 }],
    links: [{ href: '/projetos', label: 'Projetos' }],
    arquivos: [{ token: 't1', filename: 'r.pdf' }],
    arquivoErro: 'expirou',
    erro: null,
    aviso: 'algo',
  }

  it('zera o texto para a resposta nova nascer vazia', () => {
    expect(limparParaRefazer(velha).texto).toBe('')
  })

  // A correção que mais importa: o polegar da resposta NOVA gravaria contra a
  // linha ANTIGA do banco, e a avaliação apontaria pro texto errado.
  it('esquece o id da mensagem antiga', () => {
    expect(limparParaRefazer(velha).id).toBeUndefined()
  })

  // Procedência velha sob resposta nova é mentira — pior que rodapé nenhum.
  it('esquece fontes, links e arquivos da resposta anterior', () => {
    const nova = limparParaRefazer(velha)
    expect(nova.fontes).toBeUndefined()
    expect(nova.links).toBeUndefined()
    expect(nova.arquivos).toBeUndefined()
    expect(nova.arquivoErro).toBeUndefined()
  })

  it('limpa erro e aviso da tentativa anterior', () => {
    const nova = limparParaRefazer(velha)
    expect(nova.erro).toBeNull()
    expect(nova.aviso).toBeNull()
  })

  it('continua sendo uma bolha do bot', () => {
    expect(limparParaRefazer(velha).autor).toBe('bot')
  })

  it('não estoura com mensagem ausente', () => {
    expect(limparParaRefazer(undefined)).toEqual({ autor: 'bot', texto: '', erro: null, aviso: null })
  })
})
