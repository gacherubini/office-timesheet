import { useState, useRef, useEffect } from 'react'
import { Check, Copy, ThumbsUp, ThumbsDown, RotateCcw } from 'lucide-react'
import { textoDaFonte, resumoDasFontes } from '../../lib/agentFontes'
import { avaliarResposta } from '../../lib/agentClient'
import { useClickOutside } from '../../hooks/useClickOutside'

// Espelha a lista fechada da migração 038. Fechada porque o objetivo é CONTAR
// ("quantos 'incorreto' esta semana?"), e texto livre não se agrega.
const MOTIVOS = [
  { valor: 'incorreto', rotulo: 'Incorreto' },
  { valor: 'nao_era_o_que_pedi', rotulo: 'Não era o que pedi' },
  { valor: 'tom', rotulo: 'Tom ou estilo' },
  { valor: 'lento', rotulo: 'Lento' },
  { valor: 'seguranca', rotulo: 'Preocupação de segurança' },
  { valor: 'outro', rotulo: 'Outro' },
]

export function BotaoCopiar({ texto }) {
  const [ok, setOk] = useState(false)
  const t = useRef(null)
  useEffect(() => () => clearTimeout(t.current), [])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
    } catch {
      return
    }
    setOk(true)
    clearTimeout(t.current)
    t.current = setTimeout(() => setOk(false), 1500)
  }

  return (
    <button
      type="button"
      onClick={copiar}
      aria-label={ok ? 'Copiado' : 'Copiar'}
      className="inline-flex text-text-secondary transition-colors hover:text-text-primary"
    >
      {ok ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
}

// Assimetria de propósito: aprovar é um toque, reprovar abre a lista de motivos.
// Quem aprovou não tem mais nada a dizer; quem reprovou tem, e é essa a
// informação que faz o eval set crescer.
function Avaliacao({ messageId }) {
  const [voto, setVoto] = useState(null)
  const [pedindoMotivo, setPedindoMotivo] = useState(false)
  const motivoRef = useRef(null)
  // Fechar sem escolher é uma saída legítima: o negativo já foi gravado no
  // clique do polegar, e o motivo é refinamento. Sem isto o menu vira armadilha.
  useClickOutside(motivoRef, pedindoMotivo, () => setPedindoMotivo(false))

  if (!messageId) return null

  function aprovar() {
    setVoto('up')
    setPedindoMotivo(false)
    avaliarResposta(messageId, 'up')
  }

  function reprovar() {
    setVoto('down')
    setPedindoMotivo(true)
    // Grava o negativo na hora: o motivo é refinamento, não pré-requisito —
    // quem fechar sem escolher ainda deixou o sinal que importa.
    avaliarResposta(messageId, 'down')
  }

  function escolherMotivo(motivo) {
    setPedindoMotivo(false)
    avaliarResposta(messageId, 'down', motivo)
  }

  const base = 'inline-flex transition-colors'
  return (
    <>
      <button
        type="button"
        onClick={aprovar}
        aria-label="Boa resposta"
        aria-pressed={voto === 'up'}
        className={`${base} ${voto === 'up' ? 'text-green' : 'text-text-secondary hover:text-text-primary'}`}
      >
        <ThumbsUp size={14} />
      </button>
      <button
        type="button"
        onClick={reprovar}
        aria-label="Resposta ruim"
        aria-pressed={voto === 'down'}
        className={`${base} ${voto === 'down' ? 'state-danger' : 'text-text-secondary hover:text-text-primary'}`}
      >
        <ThumbsDown size={14} />
      </button>

      {pedindoMotivo && (
        <div
          ref={motivoRef}
          role="menu"
          onKeyDown={(e) => { if (e.key === 'Escape') setPedindoMotivo(false) }}
          className="absolute right-0 top-6 z-20 w-56 border border-border-subtle bg-surface py-1 shadow-[0_10px_30px_rgba(15,15,15,0.13)]"
        >
          <p className="px-3 py-1.5 text-[11px] text-text-secondary">O que houve?</p>
          {MOTIVOS.map((m) => (
            <button
              key={m.valor}
              type="button"
              onClick={() => escolherMotivo(m.valor)}
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left text-[13px] text-text-primary transition-colors hover:bg-surface-alt focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-green"
            >
              {m.rotulo}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

// Rodapé da bolha: de onde veio o que está escrito acima, e o que dá pra fazer
// com isso. A procedência fica SEMPRE visível — ela é o motivo de existir do
// rodapé, e esconder no hover anularia o ponto. As ações é que só aparecem
// quando o cursor chega — e reagem ao `group/bolha` da resposta inteira, não a
// esta faixa fina (no celular ficam sempre, porque não há hover).
export function RodapeBolha({ texto, fontes, messageId, onRefazer }) {
  const [aberto, setAberto] = useState(false)
  const items = (fontes || []).filter((f) => f?.rotulo)
  const varias = items.length > 1

  return (
    <div className="mt-1.5 flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        {items.length > 0 && (
          varias ? (
            <>
              <button
                type="button"
                onClick={() => setAberto((v) => !v)}
                aria-expanded={aberto}
                className="text-[11px] text-text-secondary underline decoration-border-subtle underline-offset-2 transition-colors hover:text-text-primary"
              >
                {resumoDasFontes(items)}
              </button>
              {aberto && (
                <ul className="mt-1 space-y-0.5">
                  {items.map((f, i) => (
                    <li key={i} className="text-[11px] text-text-secondary">{textoDaFonte(f)}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="truncate text-[11px] text-text-secondary">{textoDaFonte(items[0])}</p>
          )
        )}
      </div>
      <div className="relative flex flex-none items-center gap-2.5 transition-opacity md:opacity-0 md:focus-within:opacity-100 md:group-hover/bolha:opacity-100">
        <Avaliacao messageId={messageId} />
        {onRefazer && (
          <button
            type="button"
            onClick={onRefazer}
            aria-label="Refazer a resposta"
            className="inline-flex text-text-secondary transition-colors hover:text-text-primary"
          >
            <RotateCcw size={14} />
          </button>
        )}
        <BotaoCopiar texto={texto} />
      </div>
    </div>
  )
}
