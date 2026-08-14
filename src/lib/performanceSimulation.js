// Forma canônica da config do simulador de performance (jsonb em
// performance_simulations.planned). Vive aqui, e não dentro da rota, porque
// tem dois leitores: GET /me/simulation e a tool simulacao_performance do
// agente. Duas cópias divergiriam, e o agente afirmaria número errado.
//   config = {
//     target_amount: number>=0,             // meta de ganho do mês (R$)
//     overrides: { 'YYYY-MM-DD': minutos }  // horas extras lançadas à mão em FDS
//   }
// ATENÇÃO: `overrides` NÃO são as horas planejadas do mês. As horas dos dias
// úteis não ficam salvas — são derivadas da meta (ver planejamentoDoMes).
export const DEFAULT_SIM_CONFIG = {
  target_amount: 0,
  overrides: {},
}

// Normaliza qualquer jsonb salvo (inclusive o formato antigo de mapa de datas)
// para o shape de config atual, caindo nos defaults quando faltar/for inválido.
export function normalizeSimConfig(raw) {
  const c = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    target_amount:
      typeof c.target_amount === 'number' && Number.isFinite(c.target_amount) && c.target_amount >= 0
        ? c.target_amount
        : 0,
    overrides:
      c.overrides && typeof c.overrides === 'object' && !Array.isArray(c.overrides)
        ? c.overrides
        : {},
  }
}

// Reproduz o cálculo do PerformanceSimulator.jsx (:145-156), a única fonte do
// que o usuário enxerga como "horas planejadas":
//   total = horas já feitas
//         + horas que faltam para a meta, espalhadas nos dias úteis restantes
//         + horas de fim de semana futuras lançadas à mão (override do dia)
// A tela ainda tira feriados dos dias úteis restantes; isso só muda o resultado
// no caso extremo de TODOS os dias úteis que sobram serem feriado, e buscar o
// calendário aqui custaria uma chamada externa por pergunta.
export function planejamentoDoMes({ mes, hoje, config, horasRealizadas, valorHora }) {
  const ano = Number(mes.slice(0, 4))
  const m = Number(mes.slice(5, 7))
  const ultimoDia = new Date(Date.UTC(ano, m, 0)).getUTCDate()

  let temDiaUtilFuturo = false
  let minutosFimDeSemana = 0
  for (let dia = 1; dia <= ultimoDia; dia++) {
    const data = `${mes}-${String(dia).padStart(2, '0')}`
    if (data <= hoje) continue // passado e hoje já entraram como horas reais
    const dow = new Date(Date.UTC(ano, m - 1, dia)).getUTCDay()
    if (dow !== 0 && dow !== 6) {
      temDiaUtilFuturo = true
      continue
    }
    const override = config.overrides?.[data]
    minutosFimDeSemana += Number.isFinite(override) ? override : 0
  }

  const valorRealizado = horasRealizadas * valorHora
  const faltaGanhar = Math.max(0, config.target_amount - valorRealizado)
  // Sem valor/hora não dá para converter meta em horas — a tela também não tenta.
  const horasParaMeta = valorHora > 0 ? faltaGanhar / valorHora : 0
  const horasDiasUteis = temDiaUtilFuturo ? horasParaMeta : 0
  const horasFimDeSemana = minutosFimDeSemana / 60

  return {
    valorRealizado,
    horasParaMeta,
    horasFimDeSemana,
    horasPlanejadas: horasRealizadas + horasDiasUteis + horasFimDeSemana,
  }
}
