import { useEffect } from 'react'
import { X } from 'lucide-react'

export function Modal({ open, onClose, title, children, footer, size = 'md', closeOnBackdrop = true, overflowVisible = false }) {
  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const sizeClass =
    size === 'sm' ? 'max-w-sm' : size === 'xl' ? 'max-w-4xl' : size === 'lg' ? 'max-w-2xl' : 'max-w-md'

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose?.()
      }}
    >
      {/* max-h + flex-col + corpo rolável: sem os três, conteúdo mais alto que
          a janela transbordava para OS DOIS LADOS (o backdrop centraliza com
          `items-center`) e o pedaço de cima — título e botão de fechar — ficava
          inalcançável, porque nenhum ancestral rolava. Medido em 20/08/2026 no
          formulário de pessoa: painel de 1016px numa janela de 889px, 64px
          cortados em cima e 64px embaixo.

          É a mesma receita que o TaskDetailModal já usava; ele refazia o
          overlay à mão justamente porque este componente não a tinha. */}
      <div
        className={`bg-surface shadow-2xl w-full ${sizeClass} max-h-[90vh] flex flex-col border border-border-subtle ${
          overflowVisible ? '' : 'overflow-hidden'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* flex-none no cabeçalho e no rodapé: são as âncoras que não podem
            rolar junto — o X precisa estar sempre alcançável, e Salvar/Cancelar
            não podem exigir rolar até o fim de um formulário longo. */}
        {title && (
          <div className="flex-none flex items-center justify-between px-6 py-4 border-b border-border-subtle">
            <h2 className="font-display text-xl text-text-primary">{title}</h2>
            <button
              onClick={onClose}
              className="text-text-secondary hover:text-text-primary transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex-none px-6 py-4 bg-surface-alt border-t border-border-subtle flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
