// Lógica pura da tela de Catálogo de Etapas — nada aqui toca a API, então dá
// para testar sem mock de fetch. A tela (StageCatalogPage.jsx) só chama estas
// funções e decide o que fazer com o resultado.

// Mesma ordem que o backend usa (`ORDER BY position, name` — ver
// src/routes/projectStages.js). Reproduzimos aqui porque a lista muda de
// ordem OTIMISTAMENTE na tela antes da resposta do PUT voltar.
export function ordenarPorPosicao(itens) {
  return [...itens].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position
    return a.name.localeCompare(b.name, 'pt-BR')
  })
}

// Etapa nova entra no fim da lista visível — dez etapas com posição 10, 20,
// 30... (ver migration 047) então o passo natural é +10, nunca +1: sobra
// espaço para intercalar sem precisar renumerar tudo depois.
export function proximaPosicao(itens) {
  if (itens.length === 0) return 10
  const maior = Math.max(...itens.map((i) => Number.isInteger(i.position) ? i.position : 0))
  return maior + 10
}

// "name é obrigatório" é a mesma regra do POST /stage-catalog — validar aqui
// só evita o round-trip para descobrir o óbvio.
export function validarNome(nome) {
  const limpo = (nome || '').trim()
  if (!limpo) return { valido: false, erro: 'Informe o nome da etapa.' }
  return { valido: true, nome: limpo }
}

// Sobe (direcao -1) ou desce (direcao +1) um item trocando a POSIÇÃO com o
// vizinho imediato — não a ordem no array. Como a lista é sempre reordenada
// por posição para exibir, trocar as posições já move o item visualmente.
// Devolve os dois itens (com posição nova) para o chamador persistir via PUT;
// se o movimento é inválido (borda da lista), devolve null e não muda nada.
export function moverPosicao(itensOrdenados, indice, direcao) {
  const alvo = indice + direcao
  if (alvo < 0 || alvo >= itensOrdenados.length) return null

  const a = itensOrdenados[indice]
  const b = itensOrdenados[alvo]
  return [
    { ...a, position: b.position },
    { ...b, position: a.position },
  ]
}
