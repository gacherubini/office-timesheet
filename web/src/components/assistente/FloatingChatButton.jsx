import { Sparkles } from 'lucide-react'

// Canto inferior direito, em todas as telas autenticadas. Fica ACIMA do
// ClockInReminder no eixo vertical para os dois não disputarem o mesmo canto.
export function FloatingChatButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Abrir o assistente"
      title="Assistente"
      className="fixed bottom-20 right-5 z-30 flex h-12 w-12 items-center justify-center border border-border-subtle bg-ink text-white shadow-lg transition-transform hover:scale-105"
    >
      <Sparkles size={18} />
    </button>
  )
}
