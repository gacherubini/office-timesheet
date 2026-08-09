// Runner sob demanda: roda os casos contra o modelo REAL configurado e reporta
// acerto de escolha de tool. Não entra no CI (precisa de AGENT_API_KEY e rede).
import 'dotenv/config'
import { getClient } from '../client.js'
import { buildRegistry } from '../tools/registry.js'
import { buildSystemPrompt } from '../prompt.js'
import { CASES } from './cases.js'

async function main() {
  let acertos = 0
  for (const caso of CASES) {
    const profile = { id: 0, role: caso.papel }
    const registry = buildRegistry(profile)
    const { message } = await getClient().stream(
      {
        messages: [
          { role: 'system', content: buildSystemPrompt(profile) },
          { role: 'user', content: caso.pergunta },
        ],
        tools: registry.definitions,
        model: process.env.AGENT_MODEL,
      },
      () => {},
    )
    const tool = message.tool_calls?.[0]?.function?.name || '(nenhuma)'
    const ok = caso.espera.toolEsperada
      ? tool === caso.espera.toolEsperada
      : tool === '(nenhuma)' // casos de esclarecimento não devem chamar tool
    if (ok) acertos++
    console.log(`${ok ? 'OK ' : 'XX '} ${caso.nome} → tool=${tool}`)
  }
  console.log(`\n${acertos}/${CASES.length} casos ok`)
}

main().catch((err) => { console.error(err); process.exit(1) })
