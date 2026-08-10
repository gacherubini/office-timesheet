import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { extractText, MAX_EXTRACTED_CHARS } from '../../../lib/agent/attachments/extract.js'

const DIR = dirname(fileURLToPath(import.meta.url))
const fixture = (nome) => readFileSync(join(DIR, '..', '..', 'fixtures', nome))

// Monta um PDF mínimo VÁLIDO (xref com offsets corretos) a partir do corpo de um
// content stream. Assim os testes de PDF não dependem de um binário no repo.
function buildPdf(streamContent) {
  const header = '%PDF-1.4\n'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let body = ''
  const offsets = []
  let pos = Buffer.byteLength(header, 'latin1')
  for (let i = 0; i < objects.length; i++) {
    const objStr = `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
    offsets.push(pos)
    body += objStr
    pos += Buffer.byteLength(objStr, 'latin1')
  }
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) xref += String(off).padStart(10, '0') + ' 00000 n \n'
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`
  return Buffer.from(header + body + xref + trailer, 'latin1')
}

const pdfComTexto = (t) => buildPdf(`BT /F1 24 Tf 72 700 Td (${t}) Tj ET`)
const pdfSemTexto = () => buildPdf('q Q') // operadores válidos, nenhum texto

async function pegarErro(promessa) {
  try { await promessa; return null } catch (e) { return e }
}

describe('extractText', () => {
  it('extrai texto de .txt', async () => {
    const buf = Buffer.from('Olá briefing\nsegunda linha', 'utf8')
    const { text, meta } = await extractText(buf, { mimetype: 'text/plain', filename: 'notas.txt' })
    expect(text).toContain('Olá briefing')
    expect(text).toContain('segunda linha')
    expect(meta.kind).toBe('text')
    expect(meta.truncated).toBe(false)
  })

  it('extrai .md por extensão mesmo com MIME genérico', async () => {
    const buf = Buffer.from('# Título\nconteúdo do markdown', 'utf8')
    const { text, meta } = await extractText(buf, { mimetype: 'application/octet-stream', filename: 'brief.md' })
    expect(text).toContain('conteúdo do markdown')
    expect(meta.kind).toBe('text')
  })

  it('extrai texto de PDF', async () => {
    const { text, meta } = await extractText(pdfComTexto('Hello Briefing 123'), { mimetype: 'application/pdf', filename: 'b.pdf' })
    expect(text).toContain('Hello Briefing 123')
    expect(meta.kind).toBe('pdf')
  })

  it('extrai texto de .docx', async () => {
    const { text, meta } = await extractText(fixture('briefing.docx'), {
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      filename: 'briefing.docx',
    })
    expect(text).toContain('Walking on imported air')
    expect(meta.kind).toBe('docx')
  })

  it('rejeita formato não suportado', async () => {
    const err = await pegarErro(extractText(Buffer.from('x'), { mimetype: 'image/png', filename: 'foto.png' }))
    expect(err).toBeTruthy()
    expect(err.status).toBe(400)
    expect(err.message).toMatch(/formato|suportado/i)
  })

  it('rejeita arquivo vazio', async () => {
    const err = await pegarErro(extractText(Buffer.alloc(0), { mimetype: 'text/plain', filename: 'v.txt' }))
    expect(err).toBeTruthy()
    expect(err.status).toBe(400)
  })

  it('rejeita arquivo grande demais', async () => {
    const grande = Buffer.alloc(11 * 1024 * 1024, 0x61) // 11 MB de "a"
    const err = await pegarErro(extractText(grande, { mimetype: 'text/plain', filename: 'g.txt' }))
    expect(err).toBeTruthy()
    expect(err.status).toBe(400)
    expect(err.message).toMatch(/grande|10\s*MB/i)
  })

  it('trunca texto acima do teto e sinaliza', async () => {
    const buf = Buffer.from('a'.repeat(MAX_EXTRACTED_CHARS + 5000), 'utf8')
    const { text, meta } = await extractText(buf, { mimetype: 'text/plain', filename: 'longo.txt' })
    expect(text.length).toBe(MAX_EXTRACTED_CHARS)
    expect(meta.truncated).toBe(true)
    expect(meta.chars).toBe(MAX_EXTRACTED_CHARS)
  })

  it('rejeita PDF sem camada de texto (escaneado)', async () => {
    const err = await pegarErro(extractText(pdfSemTexto(), { mimetype: 'application/pdf', filename: 'scan.pdf' }))
    expect(err).toBeTruthy()
    expect(err.status).toBe(400)
    expect(err.message).toMatch(/escaneado|texto/i)
  })
})
