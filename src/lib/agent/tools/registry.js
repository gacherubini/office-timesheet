// Catálogo de tools filtrado por papel ANTES de montar o prompt (§8). O
// colaborador não recebe nem a definição da tool que não pode usar — assim o
// modelo não tenta, não falha e não revela o mapa.
import listarEquipe from './read/listarEquipe.js'
import proporEncerrarApontamento from './write/proporEncerrarApontamento.js'

const TODAS = [listarEquipe, proporEncerrarApontamento]

export function buildRegistry(profile) {
  const disponiveis = TODAS.filter((t) => t.roles.includes(profile.role))
  const porNome = new Map(disponiveis.map((t) => [t.definition.function.name, t]))
  return {
    definitions: disponiveis.map((t) => t.definition),
    get: (name) => porNome.get(name),
  }
}
