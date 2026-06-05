import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { activityText, relativeTime } from './helpers'

export function TaskActivity({ taskId }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/tasks/${taskId}/activity`)
      .then(setItems)
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  if (loading) return <p className="text-xs text-text-secondary py-4">Carregando...</p>

  return (
    <div className="space-y-2">
      {items.length === 0 && <p className="text-xs text-text-secondary py-4">Sem atividade.</p>}
      {items.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-2 text-xs">
          <span className="text-text-primary">{activityText(a)}</span>
          <span className="text-[10px] text-text-secondary flex-shrink-0">{relativeTime(a.created_at)}</span>
        </div>
      ))}
    </div>
  )
}
