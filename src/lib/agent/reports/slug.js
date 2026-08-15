// Nome de arquivo: NFD, minúsculas, não-alnum → hífen, máx. 60 + data + extensão.
export function slugArquivo(titulo, hojeYmd, ext) {
  const slug = String(titulo ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  return `${slug}-${hojeYmd}.${ext}`
}
