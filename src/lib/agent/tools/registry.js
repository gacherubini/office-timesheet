// Catálogo de tools filtrado por papel ANTES de montar o prompt (§8). O
// colaborador não recebe nem a definição da tool que não pode usar — assim o
// modelo não tenta, não falha e não revela o mapa.
import listarEquipe from './read/listarEquipe.js'
import proporEncerrarApontamento from './write/proporEncerrarApontamento.js'
import proporCriarApontamento from './write/proporCriarApontamento.js'
import proporCriarTask from './write/proporCriarTask.js'
import proporPedirFerias from './write/proporPedirFerias.js'
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
import consultarDados from './sql/consultarDados.js'

const TODAS = [
  listarEquipe, proporEncerrarApontamento, proporCriarApontamento, proporCriarTask,
  proporPedirFerias,
  custoPorProjeto, cargaEquipe, quemNaoApontou, tasksTravadas, feriasEConflitos,
  simulacaoPerformance, statusProjeto, andamentoDeProjeto,
  despesasDoPeriodo, apontamentosAbertos,
  consultarDados,
]

export function buildRegistry(profile) {
  const disponiveis = TODAS.filter((t) => t.roles.includes(profile.role))
  const porNome = new Map(disponiveis.map((t) => [t.definition.function.name, t]))
  return {
    definitions: disponiveis.map((t) => t.definition),
    get: (name) => porNome.get(name),
  }
}
