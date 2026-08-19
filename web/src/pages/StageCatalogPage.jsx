import { useEffect, useState } from 'react'
import { ArchiveRestore, Archive, ChevronDown, ChevronUp, Pencil, Plus } from 'lucide-react'
import { api } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Modal } from '../components/ui/Modal'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { ordenarPorPosicao, proximaPosicao, validarNome, moverPosicao } from './stageCatalog/logic'

const FORM_VAZIO = { id: null, name: '', description: '' }

// Catálogo global de etapas (defaults do escritório) — separado da gestão
// POR PROJETO (StageManagerModal, dentro de cada obra). Aqui o escritório
// mantém a lista-mestra que cada projeto ativa; lá cada projeto escolhe quais
// dessas etapas usar. GET /stage-catalog, POST /stage-catalog e
// PUT /stage-catalog/:id são de src/routes/projectStages.js.
export function StageCatalogPage() {
  const [catalogo, setCatalogo] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [busyId, setBusyId] = useState(null)

  const [editando, setEditando] = useState(null) // null | { id, name, description }
  const [salvando, setSalvando] = useState(false)
  const [erroForm, setErroForm] = useState('')

  // O acesso (só quem gerencia projetos) é barrado pelo ProtectedRoute
  // (prop projectManagerOnly) antes desta página renderizar — ver App.jsx.

  useEffect(() => { carregar() }, [])

  function carregar() {
    setCarregando(true)
    setErro('')
    // include_archived=1 traz também as arquivadas (com is_archived=true no
    // payload), para a tela poder listá-las e oferecer reativar. Sem o
    // parâmetro a API devolve só as ativas (default usado por quem popula
    // seletor de etapas em outro lugar do sistema).
    api.get('/stage-catalog?include_archived=1')
      .then((rows) => setCatalogo(rows || []))
      .catch((err) => setErro(err.message || 'Não foi possível carregar o catálogo.'))
      .finally(() => setCarregando(false))
  }

  const ativas = ordenarPorPosicao(catalogo.filter((s) => !s.is_archived))
  const arquivadas = ordenarPorPosicao(catalogo.filter((s) => s.is_archived))

  function abrirNovo() {
    setErroForm('')
    setEditando({ ...FORM_VAZIO })
  }

  function abrirEdicao(item) {
    setErroForm('')
    setEditando({ id: item.id, name: item.name, description: item.description || '' })
  }

  async function salvar() {
    const { valido, erro: erroNome, nome } = validarNome(editando.name)
    if (!valido) { setErroForm(erroNome); return }

    setSalvando(true)
    setErroForm('')
    try {
      if (editando.id) {
        await api.put(`/stage-catalog/${editando.id}`, {
          name: nome,
          description: editando.description.trim() || null,
        })
      } else {
        await api.post('/stage-catalog', {
          name: nome,
          description: editando.description.trim() || null,
          position: proximaPosicao(ativas),
        })
      }
      setEditando(null)
      carregar()
    } catch (err) {
      setErroForm(err.message || 'Não foi possível salvar a etapa.')
    } finally {
      setSalvando(false)
    }
  }

  async function mover(indice, direcao) {
    const par = moverPosicao(ativas, indice, direcao)
    if (!par) return
    setBusyId(par[0].id)
    setErro('')
    try {
      // As duas posições trocam juntas — se só uma persistisse, a lista
      // ficaria com posição duplicada até a próxima ação corrigir.
      await Promise.all(par.map((item) => api.put(`/stage-catalog/${item.id}`, { position: item.position })))
      carregar()
    } catch (err) {
      setErro(err.message || 'Não foi possível reordenar.')
    } finally {
      setBusyId(null)
    }
  }

  async function arquivar(item) {
    setBusyId(item.id)
    setErro('')
    try {
      await api.put(`/stage-catalog/${item.id}`, { is_archived: true })
      carregar()
    } catch (err) {
      setErro(err.message || 'Não foi possível arquivar a etapa.')
    } finally {
      setBusyId(null)
    }
  }

  async function reativar(item) {
    setBusyId(item.id)
    setErro('')
    try {
      await api.put(`/stage-catalog/${item.id}`, { is_archived: false })
      carregar()
    } catch (err) {
      setErro(err.message || 'Não foi possível reativar a etapa.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Catálogo de etapas"
        subtitle="Etapas padrão que cada projeto pode ativar (Anteprojeto, Executivo...). Arquive as que não fazem mais sentido — arquivar não apaga, só some da lista de escolha em projetos novos."
        actions={
          <Button onClick={abrirNovo}>
            <Plus size={16} />
            Nova etapa
          </Button>
        }
      />

      {erro && <div className="mb-4 state-danger-soft text-sm p-3">{erro}</div>}

      {carregando ? (
        <p className="text-sm text-text-secondary">Carregando...</p>
      ) : ativas.length === 0 ? (
        <div className="border border-dashed border-border-subtle py-16 text-center text-sm text-text-secondary">
          Nenhuma etapa no catálogo ainda.
        </div>
      ) : (
        <Card padded={false} className="divide-y divide-border-subtle">
          {ativas.map((item, i) => (
            <div key={item.id} className="flex items-start gap-3 px-4 py-3">
              <div className="flex flex-col pt-0.5">
                <button
                  type="button"
                  onClick={() => mover(i, -1)}
                  disabled={i === 0 || busyId === item.id}
                  aria-label={`Mover ${item.name} para cima`}
                  className="text-text-secondary hover:text-text-primary disabled:opacity-30"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => mover(i, 1)}
                  disabled={i === ativas.length - 1 || busyId === item.id}
                  aria-label={`Mover ${item.name} para baixo`}
                  className="text-text-secondary hover:text-text-primary disabled:opacity-30"
                >
                  <ChevronDown size={14} />
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary">{item.name}</p>
                {item.description && (
                  <p className="text-xs text-text-secondary mt-0.5">{item.description}</p>
                )}
              </div>

              <div className="flex items-center gap-3 flex-none">
                <button
                  type="button"
                  onClick={() => abrirEdicao(item)}
                  className="inline-flex items-center gap-1 text-[11px] text-text-secondary hover:text-text-primary"
                >
                  <Pencil size={12} /> Editar
                </button>
                <button
                  type="button"
                  onClick={() => arquivar(item)}
                  disabled={busyId === item.id}
                  className="inline-flex items-center gap-1 text-[11px] text-text-secondary hover:state-danger disabled:opacity-50"
                >
                  <Archive size={12} /> Arquivar
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Arquivadas — vêm da própria API (include_archived=1), então a lista
          é real e sobrevive a sair e voltar da tela. */}
      {arquivadas.length > 0 && (
        <div className="mt-6">
          <p className="text-[11px] uppercase tracking-wider text-text-secondary mb-1.5">
            Arquivadas
          </p>
          <Card padded={false} className="divide-y divide-border-subtle">
            {arquivadas.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <p className="min-w-0 flex-1 text-sm text-text-secondary line-through">{item.name}</p>
                <button
                  type="button"
                  onClick={() => reativar(item)}
                  disabled={busyId === item.id}
                  className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline disabled:opacity-50"
                >
                  <ArchiveRestore size={12} /> Reativar
                </button>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* Criar / editar */}
      <Modal
        open={Boolean(editando)}
        onClose={() => (salvando ? null : setEditando(null))}
        title={editando?.id ? 'Editar etapa' : 'Nova etapa'}
        size="md"
      >
        {editando && (
          <div className="space-y-3">
            {erroForm && <div className="state-danger-soft text-sm p-3">{erroForm}</div>}
            <Input
              label="Nome"
              required
              value={editando.name}
              onChange={(e) => setEditando({ ...editando, name: e.target.value })}
            />
            <Input
              label="Descrição"
              as="textarea"
              rows={2}
              value={editando.description}
              onChange={(e) => setEditando({ ...editando, description: e.target.value })}
              placeholder="Opcional"
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditando(null)} disabled={salvando}>
                Cancelar
              </Button>
              <Button onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
