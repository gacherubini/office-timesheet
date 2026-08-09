import { useState } from 'react'
import { MessageSquare, X, Send } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { streamChat, executeProposal } from '../lib/agentClient'

export default function AgentWidget() {
  const { profile } = useAuth()
  const [aberto, setAberto] = useState(false)
  const [mensagens, setMensagens] = useState([]) // { autor: 'user'|'bot', texto, proposta? }
  const [input, setInput] = useState('')
  const [conversa, setConversa] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  if (!profile) return null

  async function enviar() {
    const texto = input.trim()
    if (!texto || ocupado) return
    setInput('')
    setMensagens((m) => [...m, { autor: 'user', texto }, { autor: 'bot', texto: '' }])
    setOcupado(true)
    const idxBot = mensagens.length + 1
    try {
      await streamChat({
        message: texto,
        conversationId: conversa,
        onEvent: (e) => {
          if (e.type === 'session') setConversa(e.conversation_id)
          if (e.type === 'token') {
            setMensagens((m) => m.map((msg, i) => (i === idxBot ? { ...msg, texto: msg.texto + e.text } : msg)))
          }
          if (e.type === 'proposal') {
            setMensagens((m) => m.map((msg, i) => (i === idxBot ? { ...msg, proposta: e } : msg)))
          }
          if (e.type === 'error') {
            setMensagens((m) => m.map((msg, i) => (i === idxBot ? { ...msg, texto: `Erro: ${e.error}` } : msg)))
          }
        },
      })
    } catch (err) {
      setMensagens((m) => m.map((msg, i) => (i === idxBot ? { ...msg, texto: `Erro: ${err.message}` } : msg)))
    } finally {
      setOcupado(false)
    }
  }

  async function aprovar(idx, proposalId) {
    try {
      await executeProposal(proposalId)
      setMensagens((m) => m.map((msg, i) => (i === idx ? { ...msg, proposta: null, texto: `${msg.texto}\n✓ Feito.` } : msg)))
    } catch (err) {
      setMensagens((m) => m.map((msg, i) => (i === idx ? { ...msg, texto: `${msg.texto}\nErro: ${err.message}` } : msg)))
    }
  }

  function cancelar(idx) {
    setMensagens((m) => m.map((msg, i) => (i === idx ? { ...msg, proposta: null, texto: `${msg.texto}\n(cancelado)` } : msg)))
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-text-primary text-bg shadow-lg"
        aria-label="Abrir assistente"
      >
        <MessageSquare size={20} />
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex h-[32rem] w-80 flex-col rounded-xl border border-border-subtle bg-bg shadow-xl">
      <header className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <span className="font-medium text-text-primary">Assistente</span>
        <button onClick={() => setAberto(false)} aria-label="Fechar"><X size={18} /></button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {mensagens.map((m, i) => (
          <div key={i} className={m.autor === 'user' ? 'text-right' : 'text-left'}>
            <div className={`inline-block whitespace-pre-wrap rounded-lg px-3 py-2 ${m.autor === 'user' ? 'bg-text-primary text-bg' : 'bg-surface text-text-primary'}`}>
              {m.texto || '…'}
            </div>
            {m.proposta && (
              <div className="mt-2 rounded-lg border border-border-subtle p-3 text-left">
                <p className="mb-2 text-text-primary">{m.proposta.descricao}</p>
                <div className="flex gap-2">
                  <button onClick={() => aprovar(i, m.proposta.proposalId)} className="rounded bg-text-primary px-3 py-1 text-bg">Aprovar</button>
                  <button onClick={() => cancelar(i)} className="rounded border border-border-subtle px-3 py-1">Cancelar</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-border-subtle p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && enviar()}
          placeholder="Pergunte algo…"
          className="flex-1 rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary"
        />
        <button onClick={enviar} disabled={ocupado} aria-label="Enviar"><Send size={18} /></button>
      </div>
    </div>
  )
}
