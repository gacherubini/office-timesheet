import { useMemo } from 'react'
import { ArrowRight, FolderKanban } from 'lucide-react'
import { COLUMNS, ABANDONED_STATUS } from './helpers'

// Catálogo de projetos: a "capa" do quadro. O usuário escolhe um projeto
// aqui antes de ver as tarefas. As contagens vêm do endpoint /tasks/counts
// (agregado no banco) — não baixa a tabela de tarefas inteira.
export function ProjectCatalog({ projects, counts, search, onOpen }) {
  const countsByProject = useMemo(() => {
    const map = {}
    for (const c of counts || []) map[c.project_id] = c
    return map
  }, [counts])

  const q = search.trim().toLowerCase()
  const visible = q
    ? projects.filter((p) => `${p.name} ${p.client || ''}`.toLowerCase().includes(q))
    : projects

  if (visible.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-subtle py-16 text-center">
        <FolderKanban size={26} className="mx-auto text-text-secondary/50" />
        <p className="mt-3 text-sm text-text-secondary">
          {q ? 'Nenhum projeto encontrado para essa busca.' : 'Nenhum projeto cadastrado ainda.'}
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {visible.map((p) => {
        const c = countsByProject[p.id] || { total: 0, todo: 0, in_progress: 0, done: 0 }
        const active = (c.todo || 0) + (c.in_progress || 0)
        const completed = p.status === 'completed'
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen(p)}
            className="group text-left rounded-xl border border-border-subtle bg-surface-alt/30 overflow-hidden transition-all hover:border-accent/50 hover:bg-surface-alt/60 hover:shadow-lg hover:shadow-black/5"
          >
            <div className="relative h-24 overflow-hidden bg-gradient-to-br from-accent/15 via-accent/5 to-transparent">
              {p.image_url ? (
                <img
                  src={p.image_url}
                  alt=""
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <FolderKanban size={26} className="text-accent/40" />
                </div>
              )}
              <span
                className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider backdrop-blur-sm ${
                  completed
                    ? 'bg-emerald-500/20 text-emerald-600'
                    : 'bg-accent/20 text-accent'
                }`}
              >
                {completed ? 'Concluído' : 'Ativo'}
              </span>
            </div>

            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-text-primary">{p.name}</h3>
                  {p.client && <p className="mt-0.5 truncate text-xs text-text-secondary">{p.client}</p>}
                </div>
                <ArrowRight
                  size={15}
                  className="mt-0.5 flex-shrink-0 -translate-x-1 text-accent opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
                />
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-border-subtle/60 pt-3">
                <div className="flex items-center gap-3 text-[11px]">
                  {COLUMNS.map((col) => (
                    <span key={col.key} className="inline-flex items-center gap-1 text-text-secondary">
                      <span className={`h-1.5 w-1.5 rounded-full ${col.dot}`} />
                      <span className="tabular-nums">{c[col.key] || 0}</span>
                    </span>
                  ))}
                </div>
                <span className="text-[11px] text-text-secondary/70 tabular-nums">
                  {active > 0 ? `${active} em aberto` : 'sem pendências'}
                </span>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
