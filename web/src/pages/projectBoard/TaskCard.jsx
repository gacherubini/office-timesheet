import { MessageSquare, Paperclip, Calendar, Play, Square } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { urgency, urgencyClasses, formatMinutes, formatClock, formatShortDate, priorityMeta } from './helpers'

const TIMER_STATUSES = ['todo', 'in_progress']

export function TaskCard({
  task, onClick, onDragStart, muted = false,
  currentUserId, timerElapsed = 0, timerBusy = false, onToggleTimer,
}) {
  const u = urgency(task.due_date, task.status)
  const prio = priorityMeta(task.priority)
  const isRunning = Boolean(task.open_started_at)
  // Cronômetro direto no card: qualquer pessoa que bate ponto pode contar suas
  // próprias horas em tarefas ainda ativas (o log é por usuário).
  const canTime = Boolean(
    onToggleTimer && currentUserId && TIMER_STATUSES.includes(task.status)
  )
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onClick={() => onClick(task)}
      className={`relative bg-surface border border-border-subtle p-3 mb-2 cursor-pointer hover:border-border transition-colors ${
        muted ? 'opacity-60 hover:opacity-100' : ''
      }`}
    >
      <div className="flex items-start gap-1.5 mb-1">
        <span className={`w-2 h-2 mt-1.5 flex-shrink-0 ${prio.dot}`} title={`Prioridade ${prio.label}`} />
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
          {isRunning ? (
            <span className="text-[11px] tabular-nums state-success font-medium">{formatClock(timerElapsed)}</span>
          ) : (
            task.total_minutes > 0 && (
              <span className="text-[11px] tabular-nums">{formatMinutes(task.total_minutes)}</span>
            )
          )}
          {task.due_date && (
            <span
              title={u.label || undefined}
              className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 ${urgencyClasses(u.level === 'none' ? 'normal' : u.level)}`}
            >
              <Calendar size={11} /> {formatShortDate(task.due_date)}
            </span>
          )}
        </div>
      </div>

      {canTime && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleTimer(task) }}
          disabled={timerBusy}
          className={`mt-2.5 inline-flex w-full items-center justify-center gap-1.5 h-8 text-[13px] font-medium disabled:opacity-50 transition-colors ${
            isRunning ? 'state-danger-soft' : 'state-success-soft'
          }`}
        >
          {isRunning ? (
            <><Square size={13} /> Parar · <span className="tabular-nums">{formatClock(timerElapsed)}</span></>
          ) : (
            <><Play size={13} /> Contar horas</>
          )}
        </button>
      )}
    </div>
  )
}
