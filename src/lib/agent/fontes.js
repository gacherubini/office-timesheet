// Procedência da resposta: de onde o agente tirou o que disse.
//
// O laço já sabe qual tool rodou, com que argumentos e quantas linhas voltaram
// (é o mesmo trio que vai pro auditAgentRead). Aqui esse trio vira texto curto
// para o rodapé da bolha — quem lê "R$ 42.310" precisa poder conferir que o
// período era o mês, não a semana, sem refazer a conta na mão.

// Rótulos escritos à mão porque derivar do nome perde acento
// (`ferias_e_conflitos` → "Ferias"). Tool de leitura nova sem entrada aqui
// falha em fontes.test.js — a trava é de propósito.
export const ROTULOS = {
  listar_equipe: 'Listar equipe',
  custo_por_projeto: 'Custo por projeto',
  carga_equipe: 'Carga da equipe',
  quem_nao_apontou: 'Quem não apontou',
  tasks_travadas: 'Tarefas travadas',
  ferias_e_conflitos: 'Férias e conflitos',
  simulacao_performance: 'Simulação de performance',
  status_projeto: 'Status do projeto',
  andamento_de_projeto: 'Andamento do projeto',
  despesas_do_periodo: 'Despesas do período',
  apontamentos_abertos: 'Apontamentos abertos',
  aniversariantes: 'Aniversariantes',
  agenda_do_periodo: 'Agenda do período',
  aprovacoes_pendentes: 'Aprovações pendentes',
  meus_bonus: 'Meus bônus',
  bonus_do_periodo: 'Bônus do período',
  gerar_relatorio: 'Relatório gerado',
  consultar_dados: 'Consulta ao banco',
}

const PERIODOS = { hoje: 'hoje', semana: 'esta semana', mes: 'este mês' }

const MAX_DETALHE = 70

export function rotuloDaTool(nome) {
  if (!nome) return ''
  if (ROTULOS[nome]) return ROTULOS[nome]
  // Fallback para tool ainda sem rótulo: legível, só sem acento.
  const limpo = String(nome).replace(/_/g, ' ').trim()
  return limpo.charAt(0).toUpperCase() + limpo.slice(1)
}

function valorLegivel(v) {
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}

function cortar(texto) {
  if (texto.length <= MAX_DETALHE) return texto
  return `${texto.slice(0, MAX_DETALHE - 1).trimEnd()}…`
}

// Período primeiro: é o parâmetro que mais muda o número na tela, então é o que
// o leitor procura antes de qualquer outro.
function detalheDe(params) {
  const p = params || {}
  const partes = []
  if (p.periodo) partes.push(PERIODOS[p.periodo] || valorLegivel(p.periodo))
  for (const [chave, valor] of Object.entries(p)) {
    if (chave === 'periodo') continue
    if (valor === null || valor === undefined || valor === '') continue
    partes.push(`${chave}: ${valorLegivel(valor)}`)
  }
  return cortar(partes.join(' · '))
}

export function descreverFonte({ tool, params, count } = {}) {
  return {
    rotulo: rotuloDaTool(tool),
    detalhe: detalheDe(params),
    // Sem count a tool não contou linhas; null diz "não sei", 0 diria "nenhuma".
    count: Number.isFinite(count) ? count : null,
  }
}
