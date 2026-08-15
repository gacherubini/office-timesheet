import ExcelJS from 'exceljs'

const INVALID_SHEET = /[\\/*?:[\]]/g

function nomeAba(titulo, usados) {
  let base = String(titulo ?? 'secao').replace(INVALID_SHEET, ' ').replace(/\s+/g, ' ').trim() || 'secao'
  base = base.slice(0, 31)
  let nome = base
  let n = 2
  while (usados.has(nome.toLowerCase())) {
    const sufixo = ` (${n})`
    nome = `${base.slice(0, Math.max(1, 31 - sufixo.length))}${sufixo}`
    n += 1
  }
  usados.add(nome.toLowerCase())
  return nome
}

function escreverCelula(ws, row, col, value) {
  // exceljs indexa células a partir de 1; row.values deslocaria a coluna 0.
  ws.getCell(row, col).value = value == null ? '' : value
}

export async function renderXlsx({ secoes }) {
  const wb = new ExcelJS.Workbook()
  const usados = new Set()
  for (const s of secoes) {
    const ws = wb.addWorksheet(nomeAba(s.titulo, usados))
    if (s.erro) {
      escreverCelula(ws, 1, 1, s.erro)
      continue
    }
    let row = 1
    if (s.aviso) {
      escreverCelula(ws, row, 1, s.aviso)
      row += 1
    }
    if (!s.rows?.length) continue
    const cols = Object.keys(s.rows[0])
    cols.forEach((c, i) => escreverCelula(ws, row, i + 1, c))
    s.rows.forEach((r, ri) => {
      cols.forEach((c, i) => escreverCelula(ws, row + 1 + ri, i + 1, r[c]))
    })
  }
  if (wb.worksheets.length === 0) wb.addWorksheet('relatorio')
  return Buffer.from(await wb.xlsx.writeBuffer())
}
