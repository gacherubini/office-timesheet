// Extrai texto de anexos do agente (PDF, .docx, .txt/.md). Lê e descarta: o
// buffer vive só durante a requisição; só o texto extraído entra no contexto da
// conversa. Imagem/escaneado fica de fora — é visão, outra fatia (§4 da visão).
import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024 // 10 MB
export const MAX_EXTRACTED_CHARS = 40_000

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function erro400(msg) {
  const e = new Error(msg)
  e.status = 400
  return e
}

// Descobre o tipo por MIME, com fallback por extensão: browsers rotulam .md/.txt
// de formas inconsistentes (às vezes application/octet-stream), então o nome do
// arquivo é o desempate.
function tipoDe({ mimetype, filename }) {
  const mime = String(mimetype || '').toLowerCase().split(';')[0].trim()
  if (mime === 'application/pdf') return 'pdf'
  if (mime === DOCX_MIME) return 'docx'
  if (mime === 'text/plain' || mime === 'text/markdown') return 'text'
  const ext = (String(filename || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1]
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  if (ext === 'txt' || ext === 'md' || ext === 'markdown') return 'text'
  return null
}

async function extrairPdf(buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  try {
    const res = await parser.getText()
    // Junta o texto por página (evita os marcadores "-- N of M --" do .text agregado).
    return (res.pages || []).map((p) => p.text || '').join('\n\n')
  } catch {
    throw erro400('Não consegui ler esse PDF — pode estar corrompido ou protegido por senha.')
  } finally {
    await parser.destroy().catch(() => {})
  }
}

async function extrairDocx(buffer) {
  const { value } = await mammoth.extractRawText({ buffer })
  return value || ''
}

// Normaliza quebras/whitespace pra não jogar ruído (e token) no contexto:
// unifica CR/LF, apara espaço antes de quebra e colapsa linhas em branco extras.
function normalizar(s) {
  return String(s || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Recebe o buffer do arquivo e devolve o texto extraído + metadados. Lança erro
// com `status = 400` e mensagem legível ao usuário em toda falha esperada
// (vazio, grande demais, formato não suportado, PDF sem texto/corrompido).
export async function extractText(buffer, { mimetype, filename } = {}) {
  if (!buffer || !buffer.length) throw erro400('Arquivo vazio.')
  if (buffer.length > MAX_ATTACHMENT_BYTES) throw erro400('Arquivo grande demais (máx. 10 MB).')

  const kind = tipoDe({ mimetype, filename })
  if (!kind) throw erro400('Formato não suportado. Envie PDF, Word (.docx) ou texto (.txt/.md).')

  let cru
  if (kind === 'pdf') cru = await extrairPdf(buffer)
  else if (kind === 'docx') cru = await extrairDocx(buffer)
  else cru = buffer.toString('utf8')

  const texto = normalizar(cru)
  if (!texto) {
    throw erro400(kind === 'pdf'
      ? 'Não consegui extrair texto desse PDF — parece escaneado (imagem). Por enquanto só leio PDF com texto.'
      : 'Não encontrei texto nesse arquivo.')
  }

  const truncated = texto.length > MAX_EXTRACTED_CHARS
  return {
    text: truncated ? texto.slice(0, MAX_EXTRACTED_CHARS) : texto,
    meta: { kind, chars: truncated ? MAX_EXTRACTED_CHARS : texto.length, truncated },
  }
}
