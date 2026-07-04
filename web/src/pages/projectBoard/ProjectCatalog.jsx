import { useMemo } from 'react'
import { ArrowRight, FolderKanban, Pencil, Trash2, Upload, Play, Pause, Square } from 'lucide-react'
import { COLUMNS, formatClock } from './helpers'

// Catálogo de projetos: a "capa" do quadro. O usuário escolhe um projeto
// aqui antes de ver as tarefas. As contagens vêm do endpoint /tasks/counts
// (agregado no banco) — não baixa a tabela de tarefas inteira.
// Para admin/operação, o card também vira ponto de gestão: trocar imagem,
// editar e excluir o projeto (ações param a propagação pra não abrir o board).
export function ProjectCatalog({
  projects, counts, search, onOpen,
  canManage = false, canDelete = false, onEdit, onDelete, onPickImage,
  activeTimer = null, entryElapsed = 0, entryBusy = false,
  onStartEntry, onStopEntry, onPauseEntry, onResumeEntry,
}) {
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
        const isTiming = activeTimer?.project_id === p.id
        const isPaused = isTiming && activeTimer?.paused
        const showTimer = Boolean(onStartEntry) && !completed
        return (
          <div
            key={p.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(p)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(p) } }}
            className="group text-left rounded-xl border border-border-subtle bg-surface-alt/30 overflow-hidden transition-all hover:border-accent/50 hover:bg-surface-alt/60 hover:shadow-lg hover:shadow-black/5 cursor-pointer"
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
              {canManage && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onPickImage?.(p) }}
                  title="Trocar imagem"
                  className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/40 px-2 py-1 text-[10px] font-medium text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/55 group-hover:opacity-100"
                >
                  <Upload size={11} /> Imagem
                </button>
              )}
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

              {showTimer && (
                <div className="mt-3 flex items-center gap-2 border-t border-border-subtle/60 pt-3">
                  {isTiming ? (
                    <>
                      <span className={`flex-1 text-sm font-semibold tabular-nums ${isPaused ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {formatClock(entryElapsed)}
                        <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wider">
                          {isPaused ? 'pausado' : 'em andamento'}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); (isPaused ? onResumeEntry : onPauseEntry)?.() }}
                        disabled={entryBusy}
                        title={isPaused ? 'Retomar' : 'Pausar'}
                        className="inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0 bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 disabled:opacity-50 transition-colors"
                      >
                        {isPaused ? <Play size={16} /> : <Pause size={16} />}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onStopEntry?.() }}
                        disabled={entryBusy}
                        title="Encerrar"
                        className="inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0 bg-rose-500/15 text-rose-500 hover:bg-rose-500/25 disabled:opacity-50 transition-colors"
                      >
                        <Square size={16} />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onStartEntry?.(p) }}
                      disabled={entryBusy}
                      className="inline-flex items-center justify-center gap-2 w-full h-9 rounded-lg text-white bg-[color:var(--color-accent)] hover:opacity-90 disabled:opacity-50 text-sm font-medium transition-opacity"
                    >
                      <Play size={16} /> Apontar horas
                    </button>
                  )}
                </div>
              )}

              {(canManage || canDelete) && (
                <div className="mt-3 flex items-center gap-3 border-t border-border-subtle/60 pt-3">
                  {canManage && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onEdit?.(p) }}
                      className="inline-flex items-center gap-1 text-[11px] text-text-secondary transition-colors hover:text-text-primary"
                    >
                      <Pencil size={12} /> Editar
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDelete?.(p) }}
                      className="inline-flex items-center gap-1 text-[11px] text-rose-500 transition-colors hover:text-rose-400"
                    >
                      <Trash2 size={12} /> Excluir
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
