// Lógica pura da edição de etapas dentro de TemplateManager.jsx — nada aqui
// toca a API, então dá para testar sem montar componente (mesmo espírito de
// pages/stageCatalog/logic.js).
//
// As etapas do editor ainda não têm id (só ganham um no POST/PUT, via
// insertStages em src/routes/projectTemplates.js) — por isso cada task-padrão
// (`items[].stageIndex`) referencia a etapa pelo ÍNDICE dela dentro de
// `stages`, não por id. mover/remover têm que manter essa referência
// apontando pra etapa CERTA (pelo conteúdo), não pela posição antiga.

// Sobe (direcao -1) ou desce (direcao +1) uma etapa trocando de posição com o
// vizinho imediato. `items` acompanha a troca: quem apontava pro índice
// movido continua apontando pra mesma etapa na posição nova.
export function moverEtapa(stages, items, indice, direcao) {
  const destino = indice + direcao
  if (destino < 0 || destino >= stages.length) return { stages, items }

  const novasEtapas = [...stages]
  const tmp = novasEtapas[indice]
  novasEtapas[indice] = novasEtapas[destino]
  novasEtapas[destino] = tmp

  const novosItems = items.map((it) => {
    if (it.stageIndex === indice) return { ...it, stageIndex: destino }
    if (it.stageIndex === destino) return { ...it, stageIndex: indice }
    return it
  })

  return { stages: novasEtapas, items: novosItems }
}

// Remove a etapa no índice dado. Tasks que apontavam pra ela caem em "Sem
// etapa" (stageIndex null) — elas não somem, só perdem o vínculo, igual a um
// template antigo. Tasks de etapas seguintes deslizam o índice pra trás.
export function removerEtapa(stages, items, indice) {
  const novasEtapas = stages.filter((_, i) => i !== indice)
  const novosItems = items.map((it) => {
    if (it.stageIndex === null || it.stageIndex === undefined) return it
    if (it.stageIndex === indice) return { ...it, stageIndex: null }
    if (it.stageIndex > indice) return { ...it, stageIndex: it.stageIndex - 1 }
    return it
  })
  return { stages: novasEtapas, items: novosItems }
}

// Etapa do catálogo já está na lista do template (casada por catalog_id)?
// Usado pra desenhar o checkbox já marcado/desabilitado, mesmo raciocínio do
// StageManagerModal (etapaPorCatalogId) — aqui é só um teste de pertence.
export function etapaDoCatalogoJaAdicionada(stages, catalogId) {
  return stages.some((s) => s.catalog_id === catalogId)
}
