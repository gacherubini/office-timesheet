import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { Avatar } from '../../components/Avatar'
import { Select } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

export function LeaderManager({ projectId, users, onChange, readOnly = false }) {
  const [leaders, setLeaders] = useState([])
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      setLeaders(await api.get(`/projects/${projectId}/leaders`))
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    if (projectId) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function addLeader() {
    if (!selected) return
    setBusy(true)
    try {
      await api.post(`/projects/${projectId}/leaders`, { user_id: selected })
      setSelected('')
      await load()
      onChange?.()
    } catch (err) {
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  async function removeLeader(userId) {
    setBusy(true)
    try {
      await api.delete(`/projects/${projectId}/leaders/${userId}`)
      await load()
      onChange?.()
    } catch (err) {
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  const available = users.filter((u) => !leaders.some((l) => l.id === u.id))

  return (
    <div className="mb-5">
      <p className="text-[11px] uppercase tracking-wider text-text-secondary mb-2">Líderes do projeto</p>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {leaders.length === 0 && <span className="text-xs text-text-secondary">Nenhum líder vinculado.</span>}
        {leaders.map((l) => (
          <span key={l.id} className="inline-flex items-center gap-1.5 bg-surface border border-border-subtle rounded-full pl-1 pr-2 py-1">
            <Avatar name={l.name} url={l.avatar_url} size={18} />
            <span className="text-[11px] text-text-primary">{l.name}</span>
            {!readOnly && (
              <button onClick={() => removeLeader(l.id)} disabled={busy} className="text-text-secondary hover:text-rose-500 text-xs leading-none">×</button>
            )}
          </span>
        ))}
      </div>
      {!readOnly && (
        <div className="flex items-end gap-2">
          <Select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="flex-1"
          >
            <option value="">Adicionar líder...</option>
            {available.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
          <Button onClick={addLeader} disabled={busy || !selected}>Vincular</Button>
        </div>
      )}
    </div>
  )
}
