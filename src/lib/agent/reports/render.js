import { renderMd } from './md.js'
import { renderCsv } from './csv.js'
import { renderXlsx } from './xlsx.js'
import { renderPdf } from './pdf.js'

export async function renderRelatorio({ titulo, formato, secoes, geradoEm }) {
  const args = { titulo, secoes, geradoEm }
  switch (formato) {
    case 'md': return renderMd(args)
    case 'csv': return renderCsv(args)
    case 'xlsx': return renderXlsx(args)
    case 'pdf': return renderPdf(args)
    default: throw new Error('formato desconhecido')
  }
}
