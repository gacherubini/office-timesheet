// "A ficha do colaborador mostra a data de admissão e o tempo de casa" (item 4
// do PDF). Calculado, não guardado — coluna denormalizada aqui só ficaria velha.
//
// Datas puras ('YYYY-MM-DD') são partidas à mão em vez de viraram Date: o
// driver do pg e o construtor Date discordam de fuso, e é assim que uma data
// escorrega um dia (mesmo cuidado de src/lib/dates.js e lib/birthdays.js).
function partes(ymd) {
  const [a, m, d] = String(ymd || '').slice(0, 10).split('-').map(Number)
  if (!a || !m || !d) return null
  return { a, m, d }
}

export function tempoDeCasa(admissionDate, hojeYmd) {
  const ini = partes(admissionDate)
  const hoje = partes(hojeYmd) || partes(new Date().toISOString())
  if (!ini || !hoje) return null

  let meses = (hoje.a - ini.a) * 12 + (hoje.m - ini.m)
  if (hoje.d < ini.d) meses -= 1
  if (meses < 0) return null

  if (meses === 0) {
    const dias = Math.floor(
      (Date.UTC(hoje.a, hoje.m - 1, hoje.d) - Date.UTC(ini.a, ini.m - 1, ini.d)) / 86400000,
    )
    if (dias < 0) return null
    return `${dias} ${dias === 1 ? 'dia' : 'dias'}`
  }

  const anos = Math.floor(meses / 12)
  const resto = meses % 12
  if (anos === 0) return `${resto} ${resto === 1 ? 'mês' : 'meses'}`
  const parteAnos = `${anos} ${anos === 1 ? 'ano' : 'anos'}`
  if (resto === 0) return parteAnos
  return `${parteAnos} e ${resto} ${resto === 1 ? 'mês' : 'meses'}`
}
