// Regras de "o que ainda dá pra mexer" no transcript do assistente.
//
// Ficam aqui, fora do React, porque são a parte que erra em silêncio: um
// refazer liberado na bolha errada corrompe o histórico, e uma limpeza
// incompleta faz a avaliação da resposta nova apontar pra linha antiga do banco.

const ehBot = (m) => m?.autor === 'bot'

// Refazer só a ÚLTIMA resposta. No meio da conversa, tudo que veio depois
// respondeu à versão antiga e ficaria órfão.
export function podeRefazer(mensagens, i) {
  const lista = mensagens || []
  if (i !== lista.length - 1) return false
  const alvo = lista[i]
  if (!ehBot(alvo)) return false
  // Proposta pendente (ou já aprovada) não se refaz: a antiga continua
  // aprovável enquanto o TTL não vence, e refazer criaria uma segunda.
  if (alvo.proposta) return false
  // Erro já tem o próprio "Tentar de novo" no bloco vermelho.
  if (alvo.erro) return false
  return lista[i - 1]?.autor === 'user'
}

// Editar devolve a pergunta ao composer. Só a última — reaproveitar uma
// pergunta velha ignoraria tudo que foi conversado depois dela.
export function podeEditar(mensagens, i) {
  const lista = mensagens || []
  const alvo = lista[i]
  if (alvo?.autor !== 'user') return false
  const ultimaPergunta = lista.map((m) => m.autor).lastIndexOf('user')
  return i === ultimaPergunta
}

// Deixa a bolha pronta para receber uma resposta nova. Zerar `id` é o ponto
// crítico: sem isso o polegar da resposta NOVA gravaria contra a linha ANTIGA
// no banco. `fontes`, `links` e `arquivos` seguem junto — procedência velha sob
// texto novo é pior que rodapé nenhum.
export function limparParaRefazer(msg) {
  const nova = { ...(msg || {}), autor: 'bot', texto: '', erro: null, aviso: null }
  delete nova.id
  delete nova.fontes
  delete nova.links
  delete nova.arquivos
  delete nova.arquivo
  delete nova.arquivoErro
  return nova
}
