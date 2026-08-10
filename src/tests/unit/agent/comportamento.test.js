import { describe, it, expect } from 'vitest'
import { runAgentTurn } from '../../../lib/agent/loop.js'

// Cliente falso que NÃO chama tool e responde pedindo esclarecimento — é o
// comportamento que o §6 exige diante de pergunta ambígua. O teste fixa que o
// laço trata isso como 'done' sem forçar tool nem inventar dado.
const clientePedeEsclarecimento = {
  async stream(_p, onToken) {
    const txt = 'De qual projeto você quer o custo? Preciso do nome para responder.'
    onToken(txt)
    return { message: { role: 'assistant', content: txt }, usage: { prompt_tokens: 8, completion_tokens: 12 } }
  },
}

describe('comportamento — ambíguo pede esclarecimento, não inventa', () => {
  it('sem tool_call, o laço encerra pedindo esclarecimento (evento answer)', async () => {
    const respostas = []
    const res = await runAgentTurn({
      client: clientePedeEsclarecimento,
      profile: { id: 1, role: 'admin' },
      model: 'x',
      messages: [{ role: 'user', content: 'qual o custo?' }],
      emit: (e) => e.type === 'answer' && respostas.push(e.text),
    })
    expect(res.status).toBe('done')
    expect(respostas.join('')).toMatch(/qual projeto|preciso do nome/i)
    // não houve nenhuma mensagem role:'tool' — nada foi consultado nem inventado
    expect(res.messages.some((m) => m.role === 'tool')).toBe(false)
  })
})
