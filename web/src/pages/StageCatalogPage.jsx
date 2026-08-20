import { useEffect, useState } from 'react'
import { ArchiveRestore, Archive, GripVertical, Pencil, Plus } from 'lucide-react'
import { api } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Modal } from '../components/ui/Modal'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { ordenarPorPosicao, proximaPosicao, validarNome, reordenar } from './stageCatalog/logic'

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

  // Arrastar em três estados, porque são três perguntas diferentes:
  // - `arrastavelId`: qual linha está LIBERADA para arrastar. A linha inteira
  //   é o que arrasta (senão o "fantasma" seria só o ícone da alça), mas só
  //   depois que o mouse desce na alça — com `draggable` fixo não dá para
  //   selecionar o texto da etapa nem clicar em Editar/Arquivar.
  // - `arrastandoId`: quem está em voo, para apagar a linha de origem.
  // - `alvoId`: onde vai cair, para marcar o lugar antes de soltar.
  const [arrastavelId, setArrastavelId] = useState(null)
  const [arrastandoId, setArrastandoId] = useState(null)
  const [alvoId, setAlvoId] = useState(null)

  const [editando, setEditando] = useState(null) // null | { id, name, description }
  const [salvando, setSalvando] = useState(false)
  const [erroForm, setErroForm] = useState('')

  // O acesso (só quem gerencia projetos) é barrado pelo ProtectedRoute
  // (prop projectManagerOnly) antes desta página renderizar — ver App.jsx.

  useEffect(() => { carregar() }, [])

  // `erroParaMostrar` existe por causa da reordenação otimista: quando um PUT
  // falha, a tela precisa recarregar E dizer o porquê. Se o chamador fizesse
  // setErro antes, o setErro('') daqui apagaria a mensagem no mesmo tique.
  function carregar(erroParaMostrar = '') {
    setCarregando(true)
    setErro(erroParaMostrar)
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

  // Caminho ÚNICO de reordenação: o arrasto manda (de, para) quaisquer e o
  // teclado manda (i, i±1). Só as ATIVAS entram aqui — a lista de arquivadas
  // não tem ordem que interesse a ninguém.
  async function reordenarEtapa(de, para) {
    const { lista, alterados } = reordenar(ativas, de, para)
    if (alterados.length === 0) return

    // OTIMISTA de propósito: esperar o PUT com arrasto faz o item voltar para
    // o lugar antigo e pular de novo quando a resposta chega — o gesto fica
    // elástico e parece defeito. Aqui a lista já está no lugar certo e os PUTs
    // vão atrás.
    const posicaoNova = new Map(lista.map((i) => [i.id, i.position]))
    setCatalogo((cur) => cur.map((i) => (
      posicaoNova.has(i.id) ? { ...i, position: posicaoNova.get(i.id) } : i
    )))
    setErro('')

    try {
      await Promise.all(alterados.map((item) => (
        api.put(`/stage-catalog/${item.id}`, { position: item.position })
      )))
    } catch (err) {
      // Meia-falha (um PUT passou, outro não) deixaria a tela mentindo sobre o
      // que está gravado. Desfazer no cliente chutaria; recarregar não.
      carregar(err.message || 'Não foi possível reordenar. A lista voltou ao que está salvo.')
    }
  }

  // Mesmo padrão HTML5 nativo do quadro (KanbanBoard/TaskCard): id no
  // dataTransfer, onDragOver com preventDefault, onDrop. Nada de biblioteca.
  function aoIniciarArrasto(e, item) {
    e.dataTransfer.setData('text/plain', item.id)
    e.dataTransfer.effectAllowed = 'move'
    setArrastandoId(item.id)
  }

  function encerrarArrasto() {
    setArrastandoId(null)
    setArrastavelId(null)
    setAlvoId(null)
  }

  function aoSoltar(e, indice) {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    encerrarArrasto()
    // Pelo id, não pelo índice: a lista pode ter sido recarregada no meio do
    // gesto e um índice velho moveria a etapa errada.
    const de = ativas.findIndex((item) => item.id === id)
    if (de >= 0) reordenarEtapa(de, indice)
  }

  // Teclado não é enfeite: quem chega na alça pelo Tab tem que conseguir
  // reordenar sem mouse. As bordas (subir o primeiro, descer o último) já são
  // no-op dentro de `reordenar`, então não precisa de guarda aqui.
  function aoTeclar(e, indice) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault() // senão a página rola junto com a etapa
    reordenarEtapa(indice, indice + (e.key === 'ArrowUp' ? -1 : 1))
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
        subtitle="Etapas padrão que cada projeto pode ativar (Anteprojeto, Executivo...). Arraste pela alça para mudar a ordem. Arquive as que não fazem mais sentido — arquivar não apaga, só some da lista de escolha em projetos novos."
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
          {ativas.map((item, i) => {
            const ehAlvo = alvoId === item.id && arrastandoId !== item.id
            return (
              <div
                key={item.id}
                draggable={arrastavelId === item.id}
                onDragStart={(e) => aoIniciarArrasto(e, item)}
                onDragEnd={encerrarArrasto}
                onDragOver={(e) => { e.preventDefault(); setAlvoId(item.id) }}
                onDragLeave={() => setAlvoId((cur) => (cur === item.id ? null : cur))}
                onDrop={(e) => aoSoltar(e, i)}
                // A borda esquerda existe transparente sempre para a linha não
                // pular 2px quando vira alvo.
                className={`flex items-start gap-3 border-l-2 px-4 py-3 transition-colors ${
                  ehAlvo ? 'border-accent bg-accent/5' : 'border-transparent'
                } ${arrastandoId === item.id ? 'opacity-40' : ''}`}
              >
                <button
                  type="button"
                  onMouseDown={() => setArrastavelId(item.id)}
                  onMouseUp={() => setArrastavelId(null)}
                  onKeyDown={(e) => aoTeclar(e, i)}
                  aria-label={`Arrastar para reordenar a etapa ${item.name}`}
                  title="Arraste para reordenar (ou use ↑ e ↓ com a alça focada)"
                  className="mt-0.5 flex-none cursor-grab text-text-secondary hover:text-text-primary active:cursor-grabbing"
                >
                  <GripVertical size={16} />
                </button>

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
            )
          })}
        </Card>
      )}

      {/* Arquivadas — vêm da própria API (include_archived=1), então a lista
          é real e sobrevive a sair e voltar da tela. Sem alça: etapa fora de
          uso não tem ordem que importe. */}
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
