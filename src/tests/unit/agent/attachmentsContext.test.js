import { describe, it, expect } from 'vitest'
import { buildAttachmentBlock, buildUserMessage } from '../../../lib/agent/attachments/context.js'

describe('buildAttachmentBlock', () => {
  it('inclui o nome do arquivo e o texto entre delimitadores', () => {
    const bloco = buildAttachmentBlock({ filename: 'briefing.pdf', text: 'Escopo do projeto X', truncated: false })
    expect(bloco).toContain('briefing.pdf')
    expect(bloco).toContain('Escopo do projeto X')
    expect(bloco).toContain('<<<ANEXO>>>')
    expect(bloco).toContain('<<<FIM ANEXO>>>')
  })

  it('avisa que o conteúdo é dado, não instrução', () => {
    const bloco = buildAttachmentBlock({ filename: 'x.txt', text: 'oi', truncated: false })
    expect(bloco).toMatch(/instru/i)
    expect(bloco.toLowerCase()).toContain('dado')
  })

  it('sinaliza truncagem quando truncated', () => {
    const bloco = buildAttachmentBlock({ filename: 'x.txt', text: 'oi', truncated: true })
    expect(bloco).toMatch(/truncad/i)
  })

  it('não menciona truncagem quando o texto veio completo', () => {
    const bloco = buildAttachmentBlock({ filename: 'x.txt', text: 'oi', truncated: false })
    expect(bloco).not.toMatch(/truncad/i)
  })
})

describe('buildUserMessage', () => {
  const anexo = { filename: 'brief.pdf', text: 'Escopo do projeto X', truncated: false }

  it('sem anexo, devolve a própria mensagem', () => {
    expect(buildUserMessage({ message: 'quantas horas lancei?', attachment: null })).toBe('quantas horas lancei?')
  })

  it('com anexo e pergunta, junta o bloco do anexo e a pergunta', () => {
    const out = buildUserMessage({ message: 'qual o prazo?', attachment: anexo })
    expect(out).toContain('<<<ANEXO>>>')
    expect(out).toContain('Escopo do projeto X')
    expect(out).toContain('qual o prazo?')
  })

  it('com anexo e sem pergunta, usa uma instrução padrão de resumo', () => {
    const out = buildUserMessage({ message: '', attachment: anexo })
    expect(out).toContain('<<<ANEXO>>>')
    expect(out).toMatch(/resum/i)
  })

  it('trata pergunta só com espaços como vazia', () => {
    const out = buildUserMessage({ message: '   ', attachment: anexo })
    expect(out).toMatch(/resum/i)
  })
})
