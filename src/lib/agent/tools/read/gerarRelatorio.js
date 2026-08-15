// Relatório em arquivo: reexecuta tools de leitura e renderiza md/csv/xlsx/pdf.
// O modelo só lista fontes+params; as linhas nunca vêm da boca dele.
import { TODAS } from '../catalog.js'
import { remember, DOWNLOAD_MAX_BYTES } from '../../downloads.js'
import { logReportGenerated } from '../../audit.js'
import { renderRelatorio } from '../../reports/render.js'
import { slugArquivo } from '../../reports/slug.js'
import { APP_TZ, dateInSaoPaulo } from '../../../dates.js'

const MIME = {
  md: 'text/markdown',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
}

const MAX_LINHAS = 500

const definition = {
  type: 'function',
  function: {
    name: 'gerar_relatorio',
    description:
      'Gera um arquivo (md, csv, xlsx ou pdf) a partir de tools de leitura. Escolha as fontes e os params; o servidor reexecuta e monta o arquivo. Não invente linhas. Só use quando pedirem arquivo, Excel, PDF, CSV ou exportar.',
    parameters: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'título do relatório e base do nome do arquivo' },
        formato: { type: 'string', enum: ['md', 'csv', 'xlsx', 'pdf'] },
        fontes: {
          type: 'array',
          description: '1 a 6 fontes de leitura (tool + params)',
          items: {
            type: 'object',
            properties: {
              tool: { type: 'string' },
              params: { type: 'object' },
              titulo: { type: 'string' },
            },
            required: ['tool'],
          },
        },
      },
      required: ['titulo', 'formato', 'fontes'],
      additionalProperties: false,
    },
  },
}

function achar(nome) {
  return TODAS.find((t) => t.definition.function.name === nome)
}

function permitida(tool) {
  return Boolean(
    tool
    && tool.kind === 'read'
    && tool.roles.includes('admin')
    && tool.definition.function.name !== 'gerar_relatorio',
  )
}

function tituloSecao(fonte) {
  return fonte.titulo || String(fonte.tool || '').replace(/_/g, ' ')
}

function normalizarRows(data) {
  if (Array.isArray(data)) {
    if (data.length === 0) return { rows: [], total: 0 }
    if (data[0] && typeof data[0] === 'object' && !Array.isArray(data[0])) {
      return { rows: data, total: data.length }
    }
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const rows = Object.entries(data).map(([chave, valor]) => ({ chave, valor }))
    return { rows, total: rows.length }
  }
  return { rows: [{ valor: JSON.stringify(data ?? null) }], total: 1 }
}

async function run(profile, args) {
  const titulo = String(args?.titulo ?? '').trim()
  if (!titulo) throw new Error('titulo é obrigatório')
  const formato = args?.formato
  if (!MIME[formato]) throw new Error('formato desconhecido')
  const fontes = args?.fontes
  if (!Array.isArray(fontes) || fontes.length < 1 || fontes.length > 6) {
    throw new Error('informe entre 1 e 6 fontes')
  }

  const resolvidas = fontes.map((f) => {
    const tool = achar(f.tool)
    if (!permitida(tool)) throw new Error('fonte não permitida')
    return { spec: f, tool }
  })

  const secoes = []
  const meta = []
  for (const { spec, tool } of resolvidas) {
    const tituloS = tituloSecao(spec)
    try {
      const result = await tool.run(profile, spec.params || {})
      const { rows, total } = normalizarRows(result?.data)
      const cortadas = rows.slice(0, MAX_LINHAS)
      const secao = { titulo: tituloS, fonte: spec.tool, rows: cortadas }
      if (total > MAX_LINHAS) secao.aviso = `mostrando 500 de ${total}`
      secoes.push(secao)
      meta.push({ fonte: spec.tool, linhas: cortadas.length })
    } catch (err) {
      const msg = err?.message || 'fonte falhou'
      secoes.push({ titulo: tituloS, fonte: spec.tool, rows: [], erro: msg })
      meta.push({ fonte: spec.tool, erro: msg })
    }
  }

  if (meta.every((s) => s.erro)) {
    throw new Error('não consegui montar o relatório; refine as fontes')
  }

  const filename = slugArquivo(titulo, dateInSaoPaulo(), formato)
  const geradoEm = new Intl.DateTimeFormat('pt-BR', {
    timeZone: APP_TZ,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date())
  const mime = MIME[formato]
  const buffer = await renderRelatorio({ titulo, formato, secoes, geradoEm })

  if (buffer.length > DOWNLOAD_MAX_BYTES) {
    throw new Error('arquivo grande demais; refine as fontes ou o período')
  }

  const { token } = remember({ profile, buffer, filename, mime })
  logReportGenerated({
    profile,
    formato,
    fontes: fontes.map((f) => f.tool),
    bytes: buffer.length,
    filename,
  })

  return {
    data: { ok: true, filename, formato, secoes: meta },
    count: meta.length,
    arquivo: { token, filename, mime, bytes: buffer.length },
  }
}

export default { kind: 'read', espelha: null, roles: ['admin'], definition, run }
