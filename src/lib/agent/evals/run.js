// Runner do eval: roda os casos contra o modelo REAL configurado e reporta
// acerto por CRITÉRIO, não só por escolha de tool. Um caso só passa se todos os
// critérios declarados em `espera` passarem, MAIS as checagens de sanidade que
// valem para toda resposta — critério declarado e não checado é pior que
// critério ausente: dá a sensação de cobertura que não existe.
//
// Não entra no CI de push (precisa de AGENT_API_KEY, rede e custa dinheiro por
// execução). Roda no agendado diário `.github/workflows/agent-evals.yml` e sob
// demanda por `npm run test:evals`.
//
// Multi-turno (revisão de 2026-08-11). A versão anterior olhava só a PRIMEIRA
// mensagem do modelo, então reprovava o comportamento certo: diante de "quero
// férias do 10 ao 20" o modelo dizia "antes de propor, deixe-me verificar se há
// conflito", chamava `ferias_e_conflitos` e só então proporia — e o eval cravava
// "esperava propor_pedir_ferias". Agora o caso roda até MAX_TURNOS, devolvendo
// resultado VAZIO para cada tool de leitura, e o critério olha tudo que foi
// chamado no caminho. Vazio de propósito: o eval mede escolha de ferramenta, não
// qualidade de dado, e um banco de mentira aqui só somaria variável.
import 'dotenv/config'
import { appendFileSync } from 'node:fs'
import { getClient } from '../client.js'
import { buildRegistry } from '../tools/registry.js'
import { buildSystemPrompt } from '../prompt.js'
import { CASES } from './cases.js'
import { CHECADORES, SANIDADE } from './criterios.js'

const MAX_TURNOS = 3

// Acima disto, erro de rede/provedor deixa de ser ruído e vira diagnóstico: é
// chave errada, endpoint fora ou modelo inexistente. Nesse caso a rodada não
// pode sair verde só porque os poucos casos avaliados passaram.
const MAX_ERROS_TOLERADOS = 0.25

async function rodaCaso(caso) {
  const profile = { id: 0, role: caso.papel }
  const registry = buildRegistry(profile)
  const messages = [
    { role: 'system', content: buildSystemPrompt(profile) },
    { role: 'user', content: caso.pergunta },
  ]
  const tools = []  // toda tool pedida, na ordem
  const textos = [] // todo texto de assistente do caminho

  for (let turno = 0; turno < MAX_TURNOS; turno++) {
    const { message } = await getClient().stream(
      { messages, tools: registry.definitions, model: process.env.AGENT_MODEL },
      () => {},
    )
    if (message.content) textos.push(message.content)
    const chamadas = message.tool_calls || []
    if (!chamadas.length) break
    for (const c of chamadas) tools.push(c.function.name)
    // Escrita é o destino da conversa: a proposta É a resposta. Não se executa
    // nada aqui — o eval mede a decisão, não o efeito.
    if (chamadas.some((c) => registry.get(c.function.name)?.kind === 'write')) break
    messages.push(message)
    for (const c of chamadas) {
      const existe = !!registry.get(c.function.name)
      messages.push({
        role: 'tool',
        tool_call_id: c.id,
        content: existe ? '{"data":[],"count":0}' : '{"error":"ferramenta inexistente"}',
      })
    }
  }

  const ctx = { tools, texto: textos.join('\n'), registry }
  const falhas = []
  ctx.trecho = ctx.texto.replace(/\s+/g, ' ').slice(0, 220)

  // Sanidade primeiro: se a resposta veio degenerada, saber que a tool estava
  // certa não interessa — o texto que chegaria ao usuário é lixo.
  for (const [nome, checa] of SANIDADE) {
    const motivo = checa(ctx)
    if (motivo) falhas.push(`${nome}: ${motivo}`)
  }

  for (const [criterio, valor] of Object.entries(caso.espera)) {
    const checador = CHECADORES[criterio]
    if (!checador) {
      falhas.push(`critério "${criterio}" não tem checador — corrija o runner`)
      continue
    }
    const motivo = checador(valor, ctx)
    if (motivo) falhas.push(`${criterio}: ${motivo}`)
  }
  return { tools, falhas, trecho: ctx.trecho }
}

// Resumo em markdown na aba do job — é o que transforma um workflow vermelho em
// diagnóstico legível sem precisar abrir o log inteiro.
function anotarNoResumo(linhas) {
  const arquivo = process.env.GITHUB_STEP_SUMMARY
  if (!arquivo) return
  try {
    appendFileSync(arquivo, `${linhas.join('\n')}\n`)
  } catch {
    /* resumo é conveniência: nunca derruba a rodada */
  }
}

async function main() {
  let acertos = 0
  const erros = []
  const reprovados = []

  for (const caso of CASES) {
    // Um timeout do provedor não pode matar a suíte: antes, a exceção subia até
    // o main e as rodadas de 2026-08-11 abortaram no meio, deixando placar
    // parcial que ninguém sabia interpretar. Falha de rede é ERR (não conta como
    // acerto nem como reprovação de comportamento) e a suíte segue.
    let r
    try {
      r = await rodaCaso(caso)
    } catch (err) {
      erros.push(caso.nome)
      console.log(`ERR ${caso.nome} → ${err.message}`)
      continue
    }
    if (r.falhas.length === 0) acertos++
    else reprovados.push({ nome: caso.nome, falhas: r.falhas, trecho: r.trecho })
    console.log(`${r.falhas.length === 0 ? 'OK ' : 'XX '} ${caso.nome} → ${r.tools.join(' → ') || '(nenhuma tool)'}`)
    for (const f of r.falhas) console.log(`      ↳ ${f}`)
    // O texto é o que separa falha do agente de falha do checador — sem ele, a
    // leitura do placar vira adivinhação.
    if (r.falhas.length) console.log(`      ↳ texto: ${r.trecho || '(vazio)'}`)
  }

  const avaliados = CASES.length - erros.length
  console.log(`\n${acertos}/${avaliados} casos ok (${CASES.length} no total)`)
  if (erros.length) console.log(`${erros.length} não avaliado(s) por falha de rede/provedor: ${erros.join(', ')}`)

  // Três motivos para reprovar a rodada, e os três precisam existir:
  //  - comportamento errado é o que o eval existe para pegar;
  //  - nada avaliado quase sempre é chave/endpoint errado, e sair verde aí seria
  //    o pior desfecho — daria a impressão de que o agente está saudável;
  //  - erro de rede acima do limiar tem o mesmo problema em menor escala.
  const excessoDeErros = erros.length > CASES.length * MAX_ERROS_TOLERADOS
  const falhou = reprovados.length > 0 || avaliados === 0 || excessoDeErros

  const resumo = [
    `## Evals do agente — ${acertos}/${avaliados} ok`,
    '',
    `Modelo: \`${process.env.AGENT_MODEL || '(default do código)'}\``,
    `Provedor: \`${process.env.AGENT_PROVIDER_BASE_URL || '(default do código)'}\``,
    '',
  ]
  if (reprovados.length) {
    resumo.push('### Reprovados', '')
    for (const r of reprovados) {
      resumo.push(`**${r.nome}**`, '')
      for (const f of r.falhas) resumo.push(`- ${f}`)
      resumo.push('', `> ${r.trecho || '(vazio)'}`, '')
    }
  }
  if (erros.length) {
    resumo.push('### Não avaliados (rede/provedor)', '', ...erros.map((e) => `- ${e}`), '')
  }
  if (!falhou) resumo.push('Nenhuma regressão de comportamento.', '')
  anotarNoResumo(resumo)

  if (avaliados === 0) console.error('\nNenhum caso avaliado — verifique AGENT_API_KEY, AGENT_MODEL e o endpoint.')
  else if (excessoDeErros) console.error(`\nFalhas de rede acima do tolerado (${erros.length}/${CASES.length}).`)

  // Sem isto o workflow ficaria verde com o agente reprovando tudo — e o eval
  // agendado viraria teatro.
  if (falhou) process.exit(1)
}

main().catch((err) => { console.error(err); process.exit(1) })
