import { MessageSquare, Paperclip, Calendar } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { urgency, urgencyClasses, formatMinutes, formatShortDate, priorityMeta } from './helpers'

export function TaskCard({ task, onClick, onDragStart, muted = false }) {
  const u = urgency(task.due_date, task.status)
  const prio = priorityMeta(task.priority)
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onClick={() => onClick(task)}
      className={`bg-surface border border-border-subtle rounded-lg p-3 mb-2 cursor-pointer hover:border-border transition-colors ${
        muted ? 'opacity-60 hover:opacity-100' : ''
      }`}
    >
      <div className="flex items-start gap-1.5 mb-1">
        <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${prio.dot}`} title={`Prioridade ${prio.label}`} />
        <p className={`text-sm font-medium text-text-primary ${muted ? 'line-through decoration-text-secondary/50' : ''}`}>{task.title}</p>
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
          {task.due_date && (
            <span
              title={u.label || undefined}
              className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full ${urgencyClasses(u.level === 'none' ? 'normal' : u.level)}`}
            >
              <Calendar size={11} /> {formatShortDate(task.due_date)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
