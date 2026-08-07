import { useEffect, useRef } from 'react'
import { AlertCircle, X } from 'lucide-react'

// Toast flutuante simples (sem libs). Some sozinho depois de `duration`.
// O timer é chaveado só por `message`, então re-renders do pai não o reiniciam.
export function Toast({ message, onClose, duration = 4000, variant = 'error' }) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!message) return undefined
    const id = setTimeout(() => closeRef.current?.(), duration)
    return () => clearTimeout(id)
  }, [message, duration])

  if (!message) return null

  const tone =
    variant === 'error'
      ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
      : 'bg-surface text-text-primary border-border-subtle'

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-[bell-pop_0.18s_ease-out]">
      <div className={`flex items-center gap-2.5 border px-4 py-2.5 shadow-xl backdrop-blur-sm ${tone}`}>
        <AlertCircle size={15} className="flex-shrink-0" />
        <span className="text-sm">{message}</span>
        <button
          type="button"
          onClick={() => closeRef.current?.()}
          className="ml-1 text-current/70 hover:text-current"
          aria-label="Fechar"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
