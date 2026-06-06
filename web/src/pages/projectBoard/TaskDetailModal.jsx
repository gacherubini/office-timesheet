import { useEffect } from 'react'
import { X } from 'lucide-react'
import { TaskDetailContent } from './TaskDetailContent'

export function TaskDetailModal({ task, users, canManage, currentUserId, isAdmin, onClose, onChanged, onDeleted }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-surface w-full max-w-5xl h-full max-h-[90vh] rounded-2xl border border-border-subtle shadow-2xl flex flex-col relative overflow-hidden">
        <div className="flex items-center justify-between px-6 py-3 border-b border-border-subtle">
          <span className="text-xs text-text-secondary truncate">{task.project_name}</span>
          <button
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 relative overflow-hidden">
          <TaskDetailContent
            task={task}
            users={users}
            canManage={canManage}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            onChanged={onChanged}
            onDeleted={(id) => { onDeleted?.(id); onClose() }}
          />
        </div>
      </div>
    </div>
  )
}
