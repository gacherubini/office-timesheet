function cell(v) {
  const s = v == null ? '' : String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function renderCsv({ titulo, secoes, geradoEm }) {
  const lines = []
  if (titulo) lines.push(cell(titulo))
  if (geradoEm) lines.push(cell(geradoEm))
  for (const s of secoes) {
    lines.push('')
    lines.push(cell(s.titulo))
    if (s.aviso) lines.push(cell(s.aviso))
    if (s.erro) {
      lines.push(cell(s.erro))
    } else if (s.rows?.length) {
      const cols = Object.keys(s.rows[0])
      lines.push(cols.map(cell).join(','))
      for (const row of s.rows) {
        lines.push(cols.map((c) => cell(row[c])).join(','))
      }
    }
  }
  return Buffer.from(lines.join('\n'), 'utf8')
}
