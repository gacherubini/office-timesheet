import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { X, Send, Maximize2, Square, Info, ArrowUpRight } from 'lucide-react'
import { useAgent } from '../../contexts/AgentContext'
import { BolhaMarkdown } from './BolhaMarkdown'

// Acesso rápido ao assistente de qualquer tela. É uma VIEW da mesma conversa
// que /assistente — o estado vive no AgentContext, não aqui. A página continua
// existindo para conversa longa (lista de conversas, anexos, tela cheia); o
// PDF é explícito que o painel não a substitui.
export function ChatPanel({ aberto, onFechar }) {
  const { mensagens, ocupado, enviar, interromper, relerContexto, registrarScroll } = useAgent()
  const [input, setInput] = useState('')
  const listaRef = useRef(null)
  const pertoDoFundoRef = useRef(true)

  // Enquanto o painel estiver aberto, é a lista DELE que o contexto rola.
  // Ao fechar, devolve o comando para quem estiver montado (a página, se for o
  // caso) — o desregistro devolvido só solta se o registro ainda for deste
  // painel, senão o cleanup roubaria o da página que continuou montada.
  useEffect(() => {
    if (!aberto) return undefined
    return registrarScroll({
      pertoDoFundo: () => pertoDoFundoRef.current,
      rolarParaFim: () => {
        const el = listaRef.current
        if (!el) return
        el.scrollTop = el.scrollHeight
        pertoDoFundoRef.current = true
      },
    })
  }, [aberto, registrarScroll])

  // O carimbo da tela atual é feito por OUTRA página (projeto, tarefa, pessoa)
  // depois que o provider já montou. Abrir o painel é o momento em que o chat
  // fica visível, então é aqui que o contexto tem de ser relido — do contrário
  // a pergunta sobe com context: null.
  useEffect(() => {
    if (aberto) relerContexto()
  }, [aberto, relerContexto])

  useEffect(() => {
    if (!aberto) return undefined
    function aoTeclar(e) { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aberto, onFechar])

  if (!aberto) return null

  function aoRolar() {
    const el = listaRef.current
    if (!el) return
    pertoDoFundoRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  async function submeter(e) {
    e.preventDefault()
    const texto = input.trim()
    if (!texto || ocupado) return
    setInput('')
    await enviar(texto)
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onFechar}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label="Assistente"
        className="fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-border-subtle bg-surface shadow-2xl sm:w-[420px]"
      >
        <header className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <span className="text-sm font-medium text-text-primary">Assistente</span>
          <div className="flex items-center gap-1">
            <Link
              to="/assistente"
              onClick={onFechar}
              aria-label="Abrir o assistente em tela cheia"
              title="Abrir em tela cheia"
              className="p-1.5 text-text-secondary hover:text-text-primary"
            >
              <Maximize2 size={15} />
            </Link>
            <button
              type="button"
              onClick={onFechar}
              aria-label="Fechar o chat"
              className="p-1.5 text-text-secondary hover:text-text-primary"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <div ref={listaRef} onScroll={aoRolar} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {mensagens.length === 0 && (
            <p className="text-sm text-text-secondary">
              Pergunte alguma coisa. A conversa continua na página do assistente.
            </p>
          )}
          {mensagens.map((msg, i) => (
            <div key={i} className={msg.autor === 'user' ? 'text-right' : ''}>
              <div
                className={`inline-block max-w-[92%] px-3 py-2 text-sm ${
                  msg.autor === 'user'
                    ? 'bg-surface-alt text-text-primary'
                    : 'text-text-primary'
                }`}
              >
                {msg.autor === 'bot' ? <BolhaMarkdown texto={msg.texto || ''} /> : msg.texto}

                {/* Limite diário grava `aviso`, não `erro`. Sem renderizar isto
                    a bolha fica em branco e o usuário não descobre por que o
                    assistente parou de responder. */}
                {msg.aviso && (
                  <p className="mt-1 flex items-start gap-1.5 text-xs text-text-secondary">
                    <Info size={13} className="mt-0.5 flex-none text-orange" aria-hidden />
                    <span>{msg.aviso}</span>
                  </p>
                )}

                {/* O painel não aprova: os botões (com o preview dos dados)
                    vivem na página. Mas esconder que existe algo a decidir faz
                    a proposta expirar em 5 min sem ninguém entender o silêncio —
                    então aqui fica o empurrão para a tela cheia. */}
                {msg.proposta && !msg.aprovado && !msg.cancelado && !msg.proposta.expirado && (
                  <div className="mt-2 border border-border-subtle bg-surface-alt px-2.5 py-2 text-xs">
                    <p className="text-text-primary">{msg.proposta.descricao}</p>
                    <p className="mt-1 text-text-secondary">
                      Precisa da sua confirmação — e ela expira em alguns minutos.
                    </p>
                    <Link
                      to="/assistente"
                      onClick={onFechar}
                      className="mt-1.5 inline-flex items-center gap-1 text-text-primary underline"
                    >
                      Abrir para aprovar <ArrowUpRight size={12} aria-hidden />
                    </Link>
                  </div>
                )}

                {msg.erro && <p className="mt-1 text-xs state-danger">{msg.erro}</p>}
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={submeter} className="flex items-end gap-2 border-t border-border-subtle p-3">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submeter(e) }
            }}
            placeholder="Pergunte alguma coisa..."
            aria-label="Mensagem para o Assistente"
            className="max-h-32 flex-1 resize-none border border-border-subtle bg-bg px-3 py-2 text-sm outline-none"
          />
          {/* Parar mora nas duas views: uma resposta longa ou travada aberta
              pelo painel só se interrompia indo até /assistente. É o MESMO
              turno — o AbortController é do contexto. */}
          {ocupado ? (
            <button
              type="button"
              onClick={interromper}
              aria-label="Parar"
              className="border border-border-subtle p-2 text-text-primary"
            >
              <Square size={15} />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Enviar"
              className="border border-border-subtle p-2 text-text-primary disabled:opacity-40"
            >
              <Send size={15} />
            </button>
          )}
        </form>
      </aside>
    </>
  )
}
