import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { PDFParse } from 'pdf-parse'

const secoes = [
  { titulo: 'Quem não apontou', fonte: 'quem_nao_apontou', rows: [{ pessoa: 'Ana' }, { pessoa: 'Bia' }] },
  { titulo: 'Custo', fonte: 'custo_por_projeto', rows: [{ projeto: 'Acme', custo_horistas: 100 }] },
]

describe('renderRelatorio', () => {
  it('md contém as células', async () => {
    const { renderRelatorio } = await import('../../../lib/agent/reports/render.js')
    const buf = await renderRelatorio({ titulo: 'Semana', formato: 'md', secoes, geradoEm: '15/08/2026 10:00' })
    const t = buf.toString('utf8')
    expect(t).toContain('Ana')
    expect(t).toContain('Acme')
  })

  it('csv escapa e junta seções', async () => {
    const { renderRelatorio } = await import('../../../lib/agent/reports/render.js')
    const t = (await renderRelatorio({
      titulo: 'S', formato: 'csv',
      secoes: [{ titulo: 'A', fonte: 'x', rows: [{ nome: 'a,b', n: 1 }] }],
      geradoEm: 'x',
    })).toString('utf8')
    expect(t).toContain('"a,b"')
  })

  it('xlsx tem uma aba por fonte e as células', async () => {
    const { renderRelatorio } = await import('../../../lib/agent/reports/render.js')
    const buf = await renderRelatorio({ titulo: 'S', formato: 'xlsx', secoes, geradoEm: 'x' })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    expect(wb.worksheets.length).toBe(2)
    expect(wb.worksheets[0].getCell('A2').value).toBe('Ana')
  })

  it('pdf contém o texto das células', async () => {
    const { renderRelatorio } = await import('../../../lib/agent/reports/render.js')
    const buf = await renderRelatorio({ titulo: 'Relatório Semana', formato: 'pdf', secoes, geradoEm: '15/08/2026' })
    const parser = new PDFParse({ data: buf })
    const { text } = await parser.getText()
    await parser.destroy()
    expect(text).toMatch(/Ana/)
    expect(text).toMatch(/Acme/)
  })

  it('seção com erro vira aviso e a outra entra', async () => {
    const { renderRelatorio } = await import('../../../lib/agent/reports/render.js')
    const t = (await renderRelatorio({
      titulo: 'S', formato: 'md',
      secoes: [
        { titulo: 'X', fonte: 'x', rows: [], erro: 'fonte falhou' },
        { titulo: 'Y', fonte: 'y', rows: [{ ok: 1 }] },
      ],
      geradoEm: 'x',
    })).toString('utf8')
    expect(t).toMatch(/fonte falhou/)
    expect(t).toContain('ok')
  })
})

describe('slugArquivo', () => {
  it('gera slug + data + extensão', async () => {
    const { slugArquivo } = await import('../../../lib/agent/reports/slug.js')
    expect(slugArquivo('Semana 11/08 — ponto e custo', '2026-08-15', 'xlsx'))
      .toBe('semana-11-08-ponto-e-custo-2026-08-15.xlsx')
  })
})
