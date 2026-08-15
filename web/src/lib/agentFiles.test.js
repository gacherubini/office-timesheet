import { describe, it, expect } from 'vitest'
import { arquivosDaMensagem, anexarArquivo } from './agentFiles.js'

const csv = { token: 't1', filename: 'a.csv', mime: 'text/csv', bytes: 2 }
const pdf = { token: 't2', filename: 'a.pdf', mime: 'application/pdf', bytes: 4 }

describe('agentFiles — vários anexos na mesma bolha', () => {
  it('anexarArquivo acumula em vez de sobrescrever', () => {
    const um = anexarArquivo({ autor: 'bot', texto: 'gerei' }, csv)
    const dois = anexarArquivo(um, pdf)
    expect(arquivosDaMensagem(dois)).toEqual([csv, pdf])
  })

  it('arquivosDaMensagem lê o singular antigo', () => {
    expect(arquivosDaMensagem({ arquivo: csv })).toEqual([csv])
  })

  it('arquivosDaMensagem lê o array novo e ignora o singular vazio', () => {
    expect(arquivosDaMensagem({ arquivos: [csv, pdf], arquivo: csv })).toEqual([csv, pdf])
  })

  it('sem arquivo devolve lista vazia', () => {
    expect(arquivosDaMensagem({ texto: 'oi' })).toEqual([])
    expect(arquivosDaMensagem(null)).toEqual([])
  })
})
