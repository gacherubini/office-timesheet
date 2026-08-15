function cell(v) {
  if (v == null) return ''
  return String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

export function renderMd({ titulo, secoes, geradoEm }) {
  const lines = [`# ${titulo}`, '']
  if (geradoEm) lines.push(geradoEm, '')
  for (const s of secoes) {
    lines.push(`## ${s.titulo}`)
    if (s.aviso) lines.push('', s.aviso)
    if (s.erro) {
      lines.push('', s.erro)
    } else if (s.rows?.length) {
      const cols = Object.keys(s.rows[0])
      lines.push('')
      lines.push(`| ${cols.join(' | ')} |`)
      lines.push(`| ${cols.map(() => '---').join(' | ')} |`)
      for (const row of s.rows) {
        lines.push(`| ${cols.map((c) => cell(row[c])).join(' | ')} |`)
      }
    }
    lines.push('')
  }
  return Buffer.from(lines.join('\n'), 'utf8')
}
