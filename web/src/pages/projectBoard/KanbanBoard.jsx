import { useState } from 'react'
import { ChevronRight, Archive } from 'lucide-react'
import { COLUMNS, ABANDONED_STATUS } from './helpers'
import { TaskCard } from './TaskCard'

export function KanbanBoard({ tasks, onOpenTask, onMove, currentUserId, timerElapsed, timerBusyId, onToggleTimer }) {
  const [dragOverCol, setDragOverCol] = useState(null)
  const [showAbandoned, setShowAbandoned] = useState(false)

  function handleDragStart(e, task) {
    e.dataTransfer.setData('text/plain', task.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDrop(e, status) {
    e.preventDefault()
    setDragOverCol(null)
    const taskId = e.dataTransfer.getData('text/plain')
    const task = tasks.find((t) => t.id === taskId)
    if (task && task.status !== status) {
      onMove(task, status)
    }
  }

  const abandoned = tasks
    .filter((t) => t.status === ABANDONED_STATUS)
    .sort((a, b) => a.position - b.position)
  const isAbandonedOver = dragOverCol === ABANDONED_STATUS

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {COLUMNS.map((col) => {
          const colTasks = tasks
            .filter((t) => t.status === col.key)
            .sort((a, b) => a.position - b.position)
          const over = dragOverCol === col.key
          return (
            <div
              key={col.key}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key) }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={(e) => handleDrop(e, col.key)}
              className={`border bg-surface-alt/30 p-3 min-h-[260px] transition-all ${
                over
                  ? 'border-accent ring-2 ring-accent/20 bg-accent/5'
                  : 'border-border-subtle'
              }`}
            >
              <div className="flex items-center justify-between mb-3 px-0.5">
                <span className="inline-flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 ${col.dot}`} />
                  <span className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">{col.label}</span>
                </span>
                <span className="text-[11px] font-medium text-text-secondary tabular-nums bg-surface-alt px-2 py-0.5">
                  {colTasks.length}
                </span>
              </div>
              <div className={`h-0.5 mb-3 ${col.bar} opacity-50`} />
              {colTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onClick={onOpenTask}
                  onDragStart={handleDragStart}
                  currentUserId={currentUserId}
                  timerElapsed={timerElapsed}
                  timerBusy={timerBusyId === task.id}
                  onToggleTimer={onToggleTimer}
                />
              ))}
            </div>
          )
        })}
      </div>

      {/* Seção recolhível: tarefas abandonadas (arquivadas, não apagadas) */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOverCol(ABANDONED_STATUS) }}
        onDragLeave={() => setDragOverCol(null)}
        onDrop={(e) => handleDrop(e, ABANDONED_STATUS)}
        className={`border transition-all ${
          isAbandonedOver
            ? 'border-rose-400/50 ring-2 ring-rose-400/15 bg-rose-500/5'
            : 'border-border-subtle bg-surface-alt/20'
        }`}
      >
        <button
          type="button"
          onClick={() => setShowAbandoned((s) => !s)}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-left"
        >
          <ChevronRight
            size={14}
            className={`text-text-secondary transition-transform ${showAbandoned ? 'rotate-90' : ''}`}
          />
          <Archive size={13} className="text-text-secondary" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Abandonados</span>
          <span className="text-[11px] font-medium text-text-secondary tabular-nums bg-surface-alt px-2 py-0.5">
            {abandoned.length}
          </span>
          {isAbandonedOver && (
            <span className="ml-auto text-[11px] text-rose-400">Solte para abandonar</span>
          )}
        </button>

        {showAbandoned && (
          <div className="px-4 pb-4">
            {abandoned.length === 0 ? (
              <p className="text-[11px] text-text-secondary/70 py-4 text-center">
                Nenhuma tarefa abandonada. Arraste um card aqui para arquivar.
              </p>
            ) : ( 
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-3">
                {abandoned.map((task) => (
                  <TaskCard key={task.id} task={task} onClick={onOpenTask} onDragStart={handleDragStart} muted />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
