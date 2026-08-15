import PDFDocument from 'pdfkit'

const MARGIN = 48
const BOTTOM = 780

function garantirEspaco(doc, h = 24) {
  if (doc.y + h > BOTTOM) doc.addPage()
}

function tabela(doc, rows) {
  const cols = Object.keys(rows[0])
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const colW = Math.max(48, pageWidth / cols.length)
  const startX = doc.page.margins.left

  const linha = (vals, bold) => {
    garantirEspaco(doc, 16)
    const y = doc.y
    vals.forEach((v, i) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8)
        .text(v == null ? '' : String(v), startX + i * colW, y, {
          width: colW - 4,
          lineBreak: false,
          ellipsis: true,
        })
    })
    doc.x = startX
    doc.y = y + 14
  }

  linha(cols, true)
  for (const row of rows) linha(cols.map((c) => row[c]), false)
}

export function renderPdf({ titulo, secoes, geradoEm }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN })
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // Helvetica (WinAnsi) cobre acentos PT-BR sem fonte embutida.
    doc.font('Helvetica-Bold').fontSize(16).text(String(titulo ?? ''))
    if (geradoEm) doc.font('Helvetica').fontSize(9).text(String(geradoEm))
    doc.moveDown()

    for (const s of secoes) {
      garantirEspaco(doc, 36)
      doc.font('Helvetica-Bold').fontSize(12).text(String(s.titulo ?? ''))
      if (s.aviso) doc.font('Helvetica').fontSize(9).text(String(s.aviso))
      if (s.erro) {
        doc.font('Helvetica').fontSize(10).text(String(s.erro))
      } else if (s.rows?.length) {
        tabela(doc, s.rows)
      }
      doc.moveDown()
    }
    doc.end()
  })
}
