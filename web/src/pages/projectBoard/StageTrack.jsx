import { Check, Play, Circle } from 'lucide-react'
import { formatShortDate, formatMinutes } from './helpers'

const META = {
  aprovada:     { Icone: Check,  classe: 'state-success' },
  entregue:     { Icone: Check,  classe: 'state-success' },
  em_andamento: { Icone: Play,   classe: 'state-attention' },
  nao_iniciada: { Icone: Circle, classe: 'text-text-secondary' },
}

// "A trilha de etapas fica no topo da página do projeto, mostrando o que já
// fechou, onde o projeto está e o que vem." (item 8 do PDF)
export function StageTrack({ etapas = [], etapaAtiva, onSelecionar }) {
  if (etapas.length === 0) {
    return (
      <p className="text-xs text-text-secondary">
        Nenhuma etapa neste projeto ainda. Use "Gerenciar etapas" para começar.
      </p>
    )
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {etapas.map((e) => {
        const { Icone, classe } = META[e.status] || META.nao_iniciada
        const ativa = etapaAtiva === e.id
        const pct = e.task_count > 0 ? Math.round((e.done_count / e.task_count) * 100) : 0
        return (
          <button
            key={e.id}
            type="button"
            // Clicar na ativa volta para "todas as etapas" — o mesmo gesto que
            // filtrou desfaz o filtro, sem precisar procurar um botão de limpar.
            onClick={() => onSelecionar(ativa ? null : e.id)}
            className={`min-w-[150px] flex-1 border p-2.5 text-left transition-colors ${
              ativa ? 'border-accent bg-accent/5' : 'border-border-subtle hover:border-text-secondary'
            }`}
          >
            <span className={`flex items-center gap-1.5 text-xs ${classe}`}>
              <Icone size={12} /> {e.name}
            </span>
            {e.task_count > 0 && (
              <>
                <span className="mt-1.5 block text-[11px] tabular-nums text-text-secondary">
                  {e.done_count}/{e.task_count}
                  {e.due_date && ` · vence ${formatShortDate(e.due_date)}`}
                  {e.total_minutes > 0 && ` · ${formatMinutes(e.total_minutes)}`}
                </span>
                <span className="mt-1 block h-0.5 bg-surface-alt">
                  <span className="block h-full bg-state-success" style={{ width: `${pct}%` }} />
                </span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}
