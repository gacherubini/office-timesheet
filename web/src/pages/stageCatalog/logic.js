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

// PASSO entre posições. Dez etapas com posição 10, 20, 30... (ver migration
// 047) é o mesmo grid que `proximaPosicao` mantém — reordenar precisa devolver
// a lista no MESMO grid, senão a próxima etapa nova cairia no meio dela.
const PASSO = 10

// Tira o item de `de` e o enfia em `para`, devolvendo a lista já renumerada
// 10/20/30... Substituiu `moverPosicao`, que só sabia trocar com o vizinho:
// arrastar move várias casas de uma vez, e o teclado virou o caso particular
// `reordenar(i, i±1)` — um caminho de código só para os dois gestos.
//
// Devolve { lista, alterados }:
//   - `lista`: a ordem nova inteira, para a tela pintar OTIMISTA na hora;
//   - `alterados`: só quem mudou de posição, que é o que vai por PUT. Mandar
//     a lista inteira funcionaria, mas gravaria N linhas para mover uma —
//     e cada PUT é uma chance a mais de meia-falha para o catch tratar.
//
// Índice fora da lista (o teclado manda `-1` no primeiro item e `n` no último)
// e soltar no mesmo lugar são no-op: lista intacta, nada para gravar.
export function reordenar(itensOrdenados, de, para) {
  const n = itensOrdenados.length
  const foraDaLista = (i) => !Number.isInteger(i) || i < 0 || i >= n
  if (foraDaLista(de) || foraDaLista(para) || de === para) {
    return { lista: itensOrdenados, alterados: [] }
  }

  const nova = [...itensOrdenados]
  const [movido] = nova.splice(de, 1)
  nova.splice(para, 0, movido)

  const lista = nova.map((item, i) => ({ ...item, position: (i + 1) * PASSO }))
  // Compara com a posição de ORIGEM do próprio item (não com a do vizinho):
  // quem já estava no número certo fica de fora e não vira requisição.
  const alterados = lista.filter((item, i) => item.position !== nova[i].position)
  return { lista, alterados }
}
