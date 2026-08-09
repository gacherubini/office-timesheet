// Adaptador site do agente. POST /agent/chat streama a resposta na própria
// conexão (text/event-stream); a proposta de escrita vira um evento no stream.
// O histórico é do servidor (§11): o body traz só message + conversation_id.
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { loadSession, saveTurn } from '../lib/agent/session.js'
import { buildSystemPrompt } from '../lib/agent/prompt.js'
import { runAgentTurn } from '../lib/agent/loop.js'
import { getClient } from '../lib/agent/client.js'
import { takeProposal } from '../lib/agent/proposals.js'
import { auditAgentAction } from '../lib/agent/audit.js'
import proporEncerrarApontamento from '../lib/agent/tools/write/proporEncerrarApontamento.js'

const router = Router()

// Mapa kind → módulo de tool de escrita (para o execute rotear a proposta).
const WRITE_TOOLS = { encerrar_apontamento: proporEncerrarApontamento }

router.post('/agent/chat', requireAuth, async (req, res) => {
  const { message, conversation_id } = req.body || {}
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message é obrigatório.' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  const emit = (evento) => res.write(`data: ${JSON.stringify(evento)}\n\n`)

  const session = loadSession(conversation_id, req.profile)
  emit({ type: 'session', conversation_id: session.id })

  // Monta o contexto: system (não persistido) + histórico do servidor + a msg nova.
  const novaMsg = { role: 'user', content: message }
  const messages = [
    { role: 'system', content: buildSystemPrompt(req.profile) },
    ...session.messages,
    novaMsg,
  ]

  try {
    const { status, messages: full } = await runAgentTurn({
      client: getClient(), profile: req.profile, model: process.env.AGENT_MODEL, messages, emit,
    })
    // Persiste os turnos novos: tudo depois de system + histórico anterior.
    const novos = full.slice(1 + session.messages.length)
    saveTurn(session.id, req.profile, novos)
    emit({ type: 'done', status })
  } catch (err) {
    emit({ type: 'error', error: err.message })
  }
  res.end()
})

router.post('/agent/actions/:proposalId/execute', requireAuth, async (req, res) => {
  const proposal = takeProposal(req.params.proposalId, req.profile)
  if (!proposal) return res.status(404).json({ error: 'Proposta não encontrada ou expirada.' })

  const tool = WRITE_TOOLS[proposal.kind]
  if (!tool) return res.status(400).json({ error: 'Tipo de proposta desconhecido.' })

  try {
    const { before, after } = await tool.execute(req.profile, proposal.payload)
    auditAgentAction({ profile: req.profile, tool: proposal.kind, params: proposal.payload, before, after })
    return res.json({ ok: true, resultado: after })
  } catch (err) {
    return res.status(409).json({ error: err.message })
  }
})

export default router
