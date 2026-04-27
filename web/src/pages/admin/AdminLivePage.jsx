import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { Radio } from 'lucide-react'

export function AdminLivePage() {
  const [team, setTeam] = useState([])
  const [loading, setLoading] = useState(true)

  async function loadLive() {
    try {
      const data = await api.get('/admin/live')
      setTeam(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLive()
    const interval = setInterval(loadLive, 15000) // atualiza a cada 15s
    return () => clearInterval(interval)
  }, [])

  function statusBadge(status) {
    const map = {
      running: { text: 'Em andamento', cls: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
      paused: { text: 'Pausado', cls: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
      offline: { text: 'Offline', cls: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400' },
    }
    const s = map[status] || map.offline
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded ${s.cls}`}>
        <span className={`w-2 h-2 rounded-full ${s.dot}`} />
        {s.text}
      </span>
    )
  }

  if (loading) {
    return <div className="text-gray-400 text-center py-12">Carregando...</div>
  }

  const online = team.filter((m) => m.status !== 'offline')
  const offline = team.filter((m) => m.status === 'offline')

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Radio size={24} className="text-green-600" />
        <h1 className="text-2xl font-bold">Painel Live</h1>
        <span className="text-sm text-gray-400 ml-2">Atualiza a cada 15s</span>
      </div>

      <div className="grid gap-3">
        {online.map((member) => (
          <div key={member.id} className="bg-white rounded-lg shadow-sm border p-4 flex items-center justify-between">
            <div>
              <p className="font-medium">{member.name}</p>
              {member.project && (
                <p className="text-sm text-gray-500">{member.project}</p>
              )}
            </div>
            {statusBadge(member.status)}
          </div>
        ))}

        {offline.length > 0 && (
          <>
            <p className="text-sm text-gray-400 mt-4 mb-1">Offline</p>
            {offline.map((member) => (
              <div key={member.id} className="bg-white rounded-lg shadow-sm border p-4 flex items-center justify-between opacity-60">
                <p className="font-medium">{member.name}</p>
                {statusBadge('offline')}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
