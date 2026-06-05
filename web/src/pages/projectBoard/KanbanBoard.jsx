import { useState } from 'react'
import { COLUMNS } from './helpers'
import { TaskCard } from './TaskCard'

export function KanbanBoard({ tasks, onOpenTask, onMove }) {
  const [dragOverCol, setDragOverCol] = useState(null)

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

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {COLUMNS.map((col) => {
        const colTasks = tasks
          .filter((t) => t.status === col.key)
          .sort((a, b) => a.position - b.position)
        return (
          <div
            key={col.key}
            onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key) }}
            onDragLeave={() => setDragOverCol(null)}
            onDrop={(e) => handleDrop(e, col.key)}
            className={`rounded-xl p-3 min-h-[200px] transition-colors ${
              dragOverCol === col.key ? 'bg-surface-alt' : 'bg-surface-alt/40'
            }`}
          >
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">{col.label}</span>
              <span className="text-[11px] text-text-secondary">{colTasks.length}</span>
            </div>
            {colTasks.map((task) => (
              <TaskCard key={task.id} task={task} onClick={onOpenTask} onDragStart={handleDragStart} />
            ))}
            {colTasks.length === 0 && (
              <p className="text-[11px] text-text-secondary text-center py-6">Vazio</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
