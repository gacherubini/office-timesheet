import { useState, useRef, useEffect } from 'react'
import { Check, Copy } from 'lucide-react'
import { textoDaFonte, resumoDasFontes } from '../../lib/agentFontes'

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

// Rodapé da bolha: de onde veio o que está escrito acima, e o que dá pra fazer
// com isso. A procedência fica SEMPRE visível — ela é o motivo de existir do
// rodapé, e esconder no hover anularia o ponto. As ações é que só aparecem
// quando o cursor chega — e reagem ao `group/bolha` da resposta inteira, não a
// esta faixa fina (no celular ficam sempre, porque não há hover).
export function RodapeBolha({ texto, fontes }) {
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
      <div className="flex-none transition-opacity md:opacity-0 md:group-hover/bolha:opacity-100 md:focus-within:opacity-100">
        <BotaoCopiar texto={texto} />
      </div>
    </div>
  )
}
