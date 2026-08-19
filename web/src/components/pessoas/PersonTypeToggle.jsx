import { User, Building2 } from 'lucide-react'

// Alterna entre pessoa física e jurídica (item 3 do PDF). Controlado: recebe
// `valor` (person_type) e devolve o novo no onChange. NÃO apaga os campos do
// outro tipo — quem trocou de PF pra PJ e voltou não pode perder o que já
// tinha digitado. Quem limpa os campos irrelevantes é o payload no submit,
// nunca este componente.
export function PersonTypeToggle({ valor, onChange, readOnly = false }) {
  const opcoes = [
    { value: 'pf', label: 'Pessoa física', icon: User },
    { value: 'pj', label: 'Pessoa jurídica', icon: Building2 },
  ]

  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1.5">Tipo</label>
      <div className="flex gap-2" role="radiogroup" aria-label="Tipo de pessoa">
        {opcoes.map((opt) => {
          const Icon = opt.icon
          const ativo = valor === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={ativo}
              disabled={readOnly}
              onClick={() => onChange(opt.value)}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 border px-3 py-2 text-sm transition-colors ${
                ativo
                  ? 'border-ink bg-ink text-white'
                  : 'border-border-subtle bg-surface text-text-secondary hover:text-text-primary'
              } disabled:opacity-60`}
            >
              <Icon size={14} /> {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
