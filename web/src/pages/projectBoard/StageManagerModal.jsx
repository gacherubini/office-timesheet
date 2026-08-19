import { useEffect, useState } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { Modal } from '../../components/ui/Modal'
import { Input, Select } from '../../components/ui/Input'
import { DateField } from '../../components/ui/DateField'
import { Button } from '../../components/ui/Button'

const STATUS_OPCOES = [
  { value: 'nao_iniciada', label: 'Não iniciada' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'entregue', label: 'Entregue' },
  { value: 'aprovada', label: 'Aprovada' },
]

// "Gerenciar etapas": cada projeto ativa as etapas do catálogo que se
// aplicam e pode acrescentar extras (item 8 do PDF). A API é da Task 7
// (src/routes/projectStages.js) — este modal só é o lugar de usá-la.
//
// `stages` são as etapas JÁ ATIVAS do projeto (vindas de GET
// /projects/:id/stages, com catalog_id, due_date, owner_id, status, etc.).
// Toda mutação chama `onChanged()` para o pai recarregar essa lista — o
// modal não guarda cópia própria, só espelha o que vem por prop.
export function StageManagerModal({ projectId, stages = [], users = [], onClose, onChanged }) {
  const [catalogo, setCatalogo] = useState([])
  const [carregandoCatalogo, setCarregandoCatalogo] = useState(true)
  const [erroCatalogo, setErroCatalogo] = useState('')
  const [novoNome, setNovoNome] = useState('')
  const [salvandoNovo, setSalvandoNovo] = useState(false)
  const [busyId, setBusyId] = useState(null) // id do catalog_id ou stage_id em trâmite
  const [erroPorEtapa, setErroPorEtapa] = useState({}) // { [stageId]: mensagem }

  useEffect(() => {
    let cancelado = false
    api.get('/stage-catalog')
      .then((rows) => { if (!cancelado) setCatalogo(rows || []) })
      .catch((err) => { if (!cancelado) setErroCatalogo(err.message || 'Não foi possível carregar o catálogo.') })
      .finally(() => { if (!cancelado) setCarregandoCatalogo(false) })
    return () => { cancelado = true }
  }, [])

  const etapaPorCatalogId = new Map(stages.filter((s) => s.catalog_id).map((s) => [s.catalog_id, s]))

  async function ativarDoCatalogo(catalogItem) {
    setBusyId(catalogItem.id)
    setErroCatalogo('')
    try {
      await api.post(`/projects/${projectId}/stages`, { catalog_id: catalogItem.id })
      onChanged?.()
    } catch (err) {
      setErroCatalogo(err.message || 'Não foi possível ativar a etapa.')
    } finally {
      setBusyId(null)
    }
  }

  async function excluirEtapa(stage) {
    setBusyId(stage.id)
    setErroPorEtapa((cur) => ({ ...cur, [stage.id]: '' }))
    try {
      await api.delete(`/projects/${projectId}/stages/${stage.id}`)
      onChanged?.()
    } catch (err) {
      // A API já devolve "Mova as N tarefas antes de excluí-la." — mostra
      // como está, ela já diz o que fazer.
      setErroPorEtapa((cur) => ({ ...cur, [stage.id]: err.message }))
    } finally {
      setBusyId(null)
    }
  }

  async function adicionarExtra() {
    if (!novoNome.trim()) return
    setSalvandoNovo(true)
    setErroCatalogo('')
    try {
      await api.post(`/projects/${projectId}/stages`, { name: novoNome.trim() })
      setNovoNome('')
      onChanged?.()
    } catch (err) {
      setErroCatalogo(err.message || 'Não foi possível acrescentar a etapa.')
    } finally {
      setSalvandoNovo(false)
    }
  }

  async function salvarEtapa(stage, patch) {
    setBusyId(stage.id)
    setErroPorEtapa((cur) => ({ ...cur, [stage.id]: '' }))
    try {
      await api.put(`/projects/${projectId}/stages/${stage.id}`, patch)
      onChanged?.()
    } catch (err) {
      setErroPorEtapa((cur) => ({ ...cur, [stage.id]: err.message }))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Modal open onClose={onClose} size="lg" title="Gerenciar etapas">
      {erroCatalogo && <p className="text-xs state-danger mb-3">{erroCatalogo}</p>}

      <div className="space-y-5">
        {/* Catálogo: marca ativa/desativa cada etapa padrão */}
        <div>
          <p className="text-[11px] uppercase tracking-wider text-text-secondary mb-1.5">
            Catálogo de etapas
          </p>
          {carregandoCatalogo ? (
            <p className="text-xs text-text-secondary">Carregando...</p>
          ) : (
            <div className="border border-border-subtle divide-y divide-border-subtle">
              {catalogo.map((item) => {
                const ativa = etapaPorCatalogId.get(item.id)
                return (
                  <label
                    key={item.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-surface-alt"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(ativa)}
                      disabled={busyId === item.id || (ativa && busyId === ativa.id)}
                      onChange={() => (ativa ? excluirEtapa(ativa) : ativarDoCatalogo(item))}
                    />
                    <span className="flex-1 text-text-primary">{item.name}</span>
                    {ativa && <Check size={13} className="text-state-success" />}
                  </label>
                )
              })}
            </div>
          )}
        </div>

        {/* Acrescentar etapa extra fora do catálogo */}
        <div className="flex items-end gap-2">
          <Input
            label="Acrescentar etapa extra"
            placeholder="Ex.: Maquete física"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            className="flex-1"
          />
          <Button onClick={adicionarExtra} disabled={salvandoNovo || !novoNome.trim()}>
            <Plus size={15} /> {salvandoNovo ? 'Adicionando...' : 'Adicionar'}
          </Button>
        </div>

        {/* Etapas ativas: prazo, responsável, ordem e status in-place */}
        <div>
          <p className="text-[11px] uppercase tracking-wider text-text-secondary mb-1.5">
            Etapas ativas neste projeto
          </p>
          {stages.length === 0 && (
            <p className="text-xs text-text-secondary">Nenhuma etapa ativa ainda.</p>
          )}
          <div className="space-y-3">
            {stages.map((stage) => (
              <div key={stage.id} className="border border-border-subtle p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm font-medium text-text-primary">{stage.name}</span>
                  <button
                    type="button"
                    onClick={() => excluirEtapa(stage)}
                    disabled={busyId === stage.id}
                    aria-label={`Excluir etapa ${stage.name}`}
                    className="p-1 text-text-secondary hover:state-danger disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <DateField
                    label="Prazo"
                    size="sm"
                    value={stage.due_date || ''}
                    onChange={(e) => salvarEtapa(stage, { due_date: e.target.value || null })}
                  />
                  <Select
                    label="Responsável"
                    size="sm"
                    value={stage.owner_id || ''}
                    onChange={(e) => salvarEtapa(stage, { owner_id: e.target.value || null })}
                  >
                    <option value="">Sem responsável</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </Select>
                  <Input
                    label="Ordem"
                    type="number"
                    value={stage.position ?? 0}
                    onChange={(e) => salvarEtapa(stage, { position: Number(e.target.value) })}
                  />
                  <Select
                    label="Status"
                    size="sm"
                    value={stage.status || 'nao_iniciada'}
                    onChange={(e) => salvarEtapa(stage, { status: e.target.value })}
                  >
                    {STATUS_OPCOES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </div>
                {erroPorEtapa[stage.id] && (
                  <p className="text-xs state-danger mt-2">{erroPorEtapa[stage.id]}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
