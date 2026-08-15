// Catálogo único de tools. registry filtra por papel; gerar_relatorio
// escolhe fontes daqui para não importar o registry (ciclo).
import listarEquipe from './read/listarEquipe.js'
import proporEncerrarApontamento from './write/proporEncerrarApontamento.js'
import proporCriarApontamento from './write/proporCriarApontamento.js'
import proporCriarTask from './write/proporCriarTask.js'
import proporPedirFerias from './write/proporPedirFerias.js'
import proporLancarDespesa from './write/proporLancarDespesa.js'
import custoPorProjeto from './read/custoPorProjeto.js'
import cargaEquipe from './read/cargaEquipe.js'
import quemNaoApontou from './read/quemNaoApontou.js'
import tasksTravadas from './read/tasksTravadas.js'
import feriasEConflitos from './read/feriasEConflitos.js'
import simulacaoPerformance from './read/simulacaoPerformance.js'
import statusProjeto from './read/statusProjeto.js'
import andamentoDeProjeto from './read/andamentoDeProjeto.js'
import despesasDoPeriodo from './read/despesasDoPeriodo.js'
import apontamentosAbertos from './read/apontamentosAbertos.js'
import aniversariantes from './read/aniversariantes.js'
import agendaDoPeriodo from './read/agendaDoPeriodo.js'
import aprovacoesPendentes from './read/aprovacoesPendentes.js'
import gerarRelatorio from './read/gerarRelatorio.js'
import consultarDados from './sql/consultarDados.js'
import registrarPedidoNaoAtendido from './meta/registrarPedidoNaoAtendido.js'

export const TODAS = [
  listarEquipe, proporEncerrarApontamento, proporCriarApontamento, proporCriarTask,
  proporPedirFerias, proporLancarDespesa,
  custoPorProjeto, cargaEquipe, quemNaoApontou, tasksTravadas, feriasEConflitos,
  simulacaoPerformance, statusProjeto, andamentoDeProjeto,
  despesasDoPeriodo, apontamentosAbertos, aniversariantes,
  agendaDoPeriodo,
  aprovacoesPendentes,
  gerarRelatorio,
  consultarDados,
  registrarPedidoNaoAtendido,
]
