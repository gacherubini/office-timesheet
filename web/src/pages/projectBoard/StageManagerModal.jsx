import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
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
// Uma etapa do projeto em uma linha. Sem rótulo por campo: o cabeçalho da
// tabela nomeia as colunas uma vez, e cada campo leva o rótulo em `title` e
// `aria-label` — o que aparece no hover e no leitor de tela sem gastar altura.
// Inativa mostra só o nome; os campos nem existem, para o olho achar rápido o
// que está ligado.
function Linha({ nome, ativa, extra = false, ocupado, onAlternar, users, salvarEtapa, erro }) {
  return (
    <div className="px-2 py-1.5">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1.25fr)_3.5rem_minmax(0,1.25fr)_1.75rem] items-center gap-2">
        <label className="flex min-w-0 items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(ativa)}
            disabled={ocupado}
            onChange={onAlternar}
            aria-label={ativa ? `Desativar a etapa ${nome}` : `Ativar a etapa ${nome}`}
          />
          <span className="truncate text-text-primary" title={nome}>{nome}</span>
          {extra && <span className="shrink-0 text-[10px] text-text-secondary">extra</span>}
        </label>

        {ativa ? (
          <>
            <DateField
              size="sm"
              title="Prazo de entrega"
              aria-label={`Prazo da etapa ${nome}`}
              value={ativa.due_date || ''}
              onChange={(e) => salvarEtapa(ativa, { due_date: e.target.value || null })}
            />
            <Select
              size="sm"
              title="Responsável"
              aria-label={`Responsável da etapa ${nome}`}
              value={ativa.owner_id || ''}
              onChange={(e) => salvarEtapa(ativa, { owner_id: e.target.value || null })}
            >
              <option value="">Sem responsável</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
            <Input
              type="number"
              title="Ordem na trilha"
              aria-label={`Ordem da etapa ${nome}`}
              value={ativa.position ?? 0}
              onChange={(e) => salvarEtapa(ativa, { position: Number(e.target.value) })}
            />
            <Select
              size="sm"
              title="Status da etapa"
              aria-label={`Status da etapa ${nome}`}
              value={ativa.status || 'nao_iniciada'}
              onChange={(e) => salvarEtapa(ativa, { status: e.target.value })}
            >
              {STATUS_OPCOES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <button
              type="button"
              onClick={onAlternar}
              disabled={ocupado}
              aria-label={`Remover a etapa ${nome} deste projeto`}
              className="justify-self-end p-1 text-text-secondary hover:state-danger disabled:opacity-50"
            >
              <Trash2 size={14} />
            </button>
          </>
        ) : (
          <span className="hidden sm:block sm:col-span-5" />
        )}
      </div>
      {erro && <p className="mt-1 text-xs state-danger">{erro}</p>}
    </div>
  )
}

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
    <Modal open onClose={onClose} size="xl" title="Gerenciar etapas">
      {erroCatalogo && <p className="text-xs state-danger mb-3">{erroCatalogo}</p>}

      {/* UMA linha por etapa. Antes o modal listava cada etapa DUAS vezes —
          como checkbox no catálogo em cima e como linha editável embaixo — o
          que dobrava a altura para gerenciar a mesma coisa. Aqui o checkbox
          ativa/desativa e, quando ativa, os campos daquela etapa ficam
          editáveis na própria linha. */}
      <div className="space-y-4">
        {carregandoCatalogo ? (
          <p className="text-xs text-text-secondary">Carregando...</p>
        ) : (
          <div>
            <div className="hidden sm:grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1.25fr)_3.5rem_minmax(0,1.25fr)_1.75rem] gap-2 px-2 pb-1 text-[10px] uppercase tracking-wider text-text-secondary">
              <span>Etapa</span><span>Prazo</span><span>Responsável</span>
              <span>Ordem</span><span>Status</span><span />
            </div>
            <div className="divide-y divide-border-subtle border-y border-border-subtle">
              {catalogo.map((item) => {
                const ativa = etapaPorCatalogId.get(item.id)
                return (
                  <Linha
                    key={item.id}
                    nome={item.name}
                    ativa={ativa}
                    ocupado={busyId === item.id || Boolean(ativa && busyId === ativa.id)}
                    onAlternar={() => (ativa ? excluirEtapa(ativa) : ativarDoCatalogo(item))}
                    users={users}
                    salvarEtapa={salvarEtapa}
                    erro={ativa ? erroPorEtapa[ativa.id] : null}
                  />
                )
              })}

              {/* Etapas que não vieram do catálogo: sempre ativas, e a única
                  forma de removê-las é a lixeira — não há checkbox de catálogo
                  para elas. */}
              {stages.filter((e) => !e.catalog_id).map((e) => (
                <Linha
                  key={e.id}
                  nome={e.name}
                  extra
                  ativa={e}
                  ocupado={busyId === e.id}
                  onAlternar={() => excluirEtapa(e)}
                  users={users}
                  salvarEtapa={salvarEtapa}
                  erro={erroPorEtapa[e.id]}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex items-end gap-2">
          <Input
            label="Acrescentar etapa fora do catálogo"
            placeholder="Ex.: Maquete física"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            className="flex-1"
          />
          <Button onClick={adicionarExtra} disabled={salvandoNovo || !novoNome.trim()}>
            <Plus size={15} /> {salvandoNovo ? 'Adicionando...' : 'Adicionar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
