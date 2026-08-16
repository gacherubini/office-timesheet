import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeUser } from '../../helpers/factories.js'
import { registrar, resumo, listarNegativos, MOTIVOS } from '../../../lib/agent/feedbackRepo.js'
import { insertTurn } from '../../../lib/agent/conversationsRepo.js'
import { randomUUID } from 'node:crypto'

// Cria uma conversa com uma resposta do bot e devolve o id daquela mensagem —
// é ele que a avaliação referencia.
async function respostaDoBot(profile, texto = 'R$ 42.310.') {
  const conversationId = randomUUID()
  const ids = await insertTurn(conversationId, profile, [
    { role: 'user', content: 'quanto custou?', tool_calls: null, tool_call_id: null, ui: { texto_visivel: 'quanto custou?' } },
    { role: 'assistant', content: texto, tool_calls: null, tool_call_id: null, ui: null },
  ])
  return { conversationId, messageId: ids.find((r) => r.role === 'assistant').id }
}

describe('feedbackRepo', () => {
  let user
  beforeEach(async () => {
    await resetDb()
    user = await makeUser({ role: 'admin' })
  })

  it('grava um positivo sem motivo', async () => {
    const { messageId } = await respostaDoBot(user)
    await registrar({ messageId, userId: user.id, rating: 'up' })
    const { rows } = await query('SELECT * FROM agent_feedback')
    expect(rows).toHaveLength(1)
    expect(rows[0].rating).toBe('up')
    expect(rows[0].motivo).toBeNull()
  })

  it('grava um negativo com motivo da lista fechada', async () => {
    const { messageId } = await respostaDoBot(user)
    await registrar({ messageId, userId: user.id, rating: 'down', motivo: 'incorreto' })
    const { rows } = await query('SELECT rating, motivo FROM agent_feedback')
    expect(rows[0]).toMatchObject({ rating: 'down', motivo: 'incorreto' })
  })

  it('reavaliar sobrescreve em vez de empilhar', async () => {
    const { messageId } = await respostaDoBot(user)
    await registrar({ messageId, userId: user.id, rating: 'up' })
    await registrar({ messageId, userId: user.id, rating: 'down', motivo: 'tom' })
    const { rows } = await query('SELECT rating, motivo FROM agent_feedback')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ rating: 'down', motivo: 'tom' })
  })

  it('voltar para positivo limpa o motivo — senão fica motivo órfão de um down antigo', async () => {
    const { messageId } = await respostaDoBot(user)
    await registrar({ messageId, userId: user.id, rating: 'down', motivo: 'lento' })
    await registrar({ messageId, userId: user.id, rating: 'up' })
    const { rows } = await query('SELECT rating, motivo FROM agent_feedback')
    expect(rows[0]).toMatchObject({ rating: 'up', motivo: null })
  })

  it('motivo fora da lista é recusado', async () => {
    const { messageId } = await respostaDoBot(user)
    await expect(registrar({ messageId, userId: user.id, rating: 'down', motivo: 'chutei' }))
      .rejects.toThrow(/motivo/i)
  })

  it('rating fora de up/down é recusado', async () => {
    const { messageId } = await respostaDoBot(user)
    await expect(registrar({ messageId, userId: user.id, rating: 'talvez' }))
      .rejects.toThrow(/rating/i)
  })

  it('a lista de motivos é a mesma da migração', () => {
    expect(MOTIVOS).toEqual(['incorreto', 'nao_era_o_que_pedi', 'tom', 'lento', 'seguranca', 'outro'])
  })

  it('apagar a conversa leva a avaliação junto', async () => {
    const { conversationId, messageId } = await respostaDoBot(user)
    await registrar({ messageId, userId: user.id, rating: 'up' })
    await query('DELETE FROM agent_conversations WHERE id = $1', [conversationId])
    const { rows } = await query('SELECT * FROM agent_feedback')
    expect(rows).toHaveLength(0)
  })

  describe('resumo', () => {
    it('conta positivos, negativos e agrupa os motivos', async () => {
      const a = await respostaDoBot(user, 'um')
      const b = await respostaDoBot(user, 'dois')
      const c = await respostaDoBot(user, 'três')
      await registrar({ messageId: a.messageId, userId: user.id, rating: 'up' })
      await registrar({ messageId: b.messageId, userId: user.id, rating: 'down', motivo: 'incorreto' })
      await registrar({ messageId: c.messageId, userId: user.id, rating: 'down', motivo: 'incorreto' })

      const r = await resumo()
      expect(r.up).toBe(1)
      expect(r.down).toBe(2)
      expect(r.motivos).toEqual([{ motivo: 'incorreto', total: 2 }])
    })

    it('sem avaliação nenhuma devolve zeros, não erro', async () => {
      const r = await resumo()
      expect(r).toEqual({ up: 0, down: 0, motivos: [] })
    })
  })

  describe('listarNegativos', () => {
    it('traz o texto da resposta reprovada, para dar pra triar sem abrir a conversa', async () => {
      const { messageId } = await respostaDoBot(user, 'resposta ruim')
      await registrar({ messageId, userId: user.id, rating: 'down', motivo: 'incorreto' })
      const lista = await listarNegativos()
      expect(lista).toHaveLength(1)
      expect(lista[0]).toMatchObject({ motivo: 'incorreto', resposta: 'resposta ruim' })
      expect(lista[0].pergunta).toBe('quanto custou?')
    })

    it('positivo não entra na fila de triagem', async () => {
      const { messageId } = await respostaDoBot(user)
      await registrar({ messageId, userId: user.id, rating: 'up' })
      expect(await listarNegativos()).toEqual([])
    })
  })
})
