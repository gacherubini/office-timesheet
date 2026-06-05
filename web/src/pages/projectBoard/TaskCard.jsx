import { MessageSquare, Paperclip } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { urgency, urgencyClasses, formatMinutes, priorityMeta, labelClasses } from './helpers'

export function TaskCard({ task, onClick, onDragStart }) {
  const u = urgency(task.due_date, task.status)
  const prio = priorityMeta(task.priority)
  const labels = task.labels || []
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onClick={() => onClick(task)}
      className="bg-surface border border-border-subtle rounded-lg p-3 mb-2 cursor-pointer hover:border-border transition-colors"
    >
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {labels.map((l) => (
            <span key={l.id} className={`text-[10px] px-1.5 py-0.5 rounded-full ${labelClasses(l.color)}`}>{l.text}</span>
          ))}
        </div>
      )}
      <div className="flex items-start gap-1.5 mb-1">
        <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${prio.dot}`} title={`Prioridade ${prio.label}`} />
        <p className="text-sm font-medium text-text-primary">{task.title}</p>
      </div>
      <p className="text-[11px] text-text-secondary truncate mb-2">{task.project_name}</p>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {task.assignee_id ? (
            <>
              <Avatar name={task.assignee_name} url={task.assignee_avatar_url} size={20} />
              <span className="text-[11px] text-text-secondary truncate">{task.assignee_name}</span>
            </>
          ) : (
            <span className="text-[11px] text-text-secondary italic">Sem responsável</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 text-text-secondary">
          {task.comment_count > 0 && (
            <span className="flex items-center gap-0.5 text-[11px]"><MessageSquare size={12} />{task.comment_count}</span>
          )}
          {task.attachment_count > 0 && (
            <span className="flex items-center gap-0.5 text-[11px]"><Paperclip size={12} />{task.attachment_count}</span>
          )}
          {task.total_minutes > 0 && (
            <span className="text-[11px] tabular-nums">{formatMinutes(task.total_minutes)}</span>
          )}
          {u.level !== 'none' && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${urgencyClasses(u.level)}`}>{u.label}</span>
          )}
        </div>
      </div>
    </div>
  )
}
