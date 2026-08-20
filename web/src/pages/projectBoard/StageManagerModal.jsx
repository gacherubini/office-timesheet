import { useEffect, useState } from 'react'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { Modal } from '../../components/ui/Modal'
import { Input, Select } from '../../components/ui/Input'
import { DateField } from '../../components/ui/DateField'
import { Button } from '../../components/ui/Button'
// Mesma regra de ordem do Catálogo de etapas, uma implementação só: lá o
// arrasto mexe em stage_catalog.position, aqui em project_stages.position, mas
// "tira daqui, põe ali e renumera de 10 em 10" é idêntico nos dois. Duplicar
// isso seria a forma mais fácil de os dois lados divergirem.
import { ordenarPorPosicao, reordenar } from '../stageCatalog/logic'

const STATUS_OPCOES = [
  { value: 'nao_iniciada', label: 'Não iniciada' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'entregue', label: 'Entregue' },
  { value: 'aprovada', label: 'Aprovada' },
]

// Uma linha por etapa, nos dois grupos. Sem rótulo por campo: o cabeçalho da
// tabela nomeia as colunas uma vez, e cada campo leva o rótulo em `title` e
// `aria-label` — o que aparece no hover e no leitor de tela sem gastar altura.
// Não ativada mostra só o nome; os campos nem existem, para o olho achar
// rápido o que está ligado.
function Linha({
  nome, ativa, extra = false, ocupado, onAlternar, users, salvarEtapa, erro,
  // Só o grupo de cima (as etapas que existem em project_stages) arrasta —
  // por isso alça e handlers chegam de fora em vez de a linha assumi-los.
  alca = null, ehAlvo = false, arrastando = false, propsDeArrasto = {},
}) {
  return (
    <div
      {...propsDeArrasto}
      // A borda esquerda existe transparente sempre para a linha não pular 2px
      // quando vira alvo do drop.
      className={`border-l-2 px-2 py-1.5 transition-colors ${
        ehAlvo ? 'border-accent bg-accent/5' : 'border-transparent'
      } ${arrastando ? 'opacity-40' : ''}`}
    >
      <div className="grid grid-cols-1 sm:grid-cols-[1.25rem_minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1.25fr)_1.75rem] items-center gap-2">
        {/* A coluna da alça existe em TODA linha, vazia nas não ativadas, para
            os dois grupos ficarem na mesma régua. Some no mobile junto com o
            cabeçalho: abaixo de sm o grid vira uma coluna e o ícone viraria uma
            linha solta — e arrasto HTML5 não existe em toque de qualquer jeito. */}
        <span className="hidden sm:flex sm:items-center sm:justify-center">{alca}</span>

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
          <span className="hidden sm:block sm:col-span-4" />
        )}
      </div>
      {erro && <p className="mt-1 text-xs state-danger">{erro}</p>}
    </div>
  )
}

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
  const [erroCatalogo, setErroCatalogo] = useState('') // faixa geral do topo
  const [novoNome, setNovoNome] = useState('')
  const [salvandoNovo, setSalvandoNovo] = useState(false)
  const [busyId, setBusyId] = useState(null) // id do catalog_id ou stage_id em trâmite
  const [erroPorEtapa, setErroPorEtapa] = useState({}) // { [stageId]: mensagem }

  // Arrasto, mesmos três estados do Catálogo de etapas (StageCatalogPage.jsx):
  // quem está LIBERADA para arrastar (o mouse desceu na alça), quem está em
  // voo e onde vai cair.
  const [arrastavelId, setArrastavelId] = useState(null)
  const [arrastandoId, setArrastandoId] = useState(null)
  const [alvoId, setAlvoId] = useState(null)
  // { [stageId]: position } aplicado por cima da prop enquanto os PUTs correm.
  const [posicoesOtimistas, setPosicoesOtimistas] = useState(null)

  useEffect(() => {
    let cancelado = false
    api.get('/stage-catalog')
      .then((rows) => { if (!cancelado) setCatalogo(rows || []) })
      .catch((err) => { if (!cancelado) setErroCatalogo(err.message || 'Não foi possível carregar o catálogo.') })
      .finally(() => { if (!cancelado) setCarregandoCatalogo(false) })
    return () => { cancelado = true }
  }, [])

  // A lista de etapas é do PAI. Quando ele entrega uma lista nova (o
  // recarregamento que `onChanged()` dispara), ela é a verdade e o remendo
  // otimista sai de cena — inclusive quando um PUT falhou e o servidor guardou
  // metade do movimento.
  useEffect(() => { setPosicoesOtimistas(null) }, [stages])

  // GRUPO 1 — as etapas DESTE projeto, na ordem DO PROJETO. Sai de `stages`, e
  // não do catálogo, por três motivos: é onde a `position` mora; é o que faz
  // as extras (sem catalog_id) aparecerem intercaladas em vez de presas no
  // fim; e é o que mantém visível uma etapa cujo item do catálogo foi
  // arquivado depois (GET /stage-catalog não devolve arquivadas — pela lista
  // antiga ela sumia da tela e ninguém conseguia mais editá-la).
  const doProjeto = ordenarPorPosicao(
    posicoesOtimistas
      ? stages.map((e) => (
        posicoesOtimistas[e.id] === undefined ? e : { ...e, position: posicoesOtimistas[e.id] }
      ))
      : stages,
  )

  // GRUPO 2 — o que o projeto ainda não ativou, na ordem do catálogo. Estas
  // linhas NÃO existem em project_stages: não têm position para gravar, então
  // não têm alça. O checkbox delas continua sendo o jeito de ativar.
  const jaAtivados = new Set(stages.filter((e) => e.catalog_id).map((e) => e.catalog_id))
  const naoAtivadas = catalogo.filter((item) => !jaAtivados.has(item.id))

  async function ativarDoCatalogo(catalogItem) {
    setBusyId(catalogItem.id)
    setErroCatalogo('')
    try {
      // Sem `position` de propósito: o backend copia a do catálogo
      // (src/routes/projectStages.js, POST). É de graça e costuma acertar —
      // quem ativa Estudo, Anteprojeto e Executivo em sequência já recebe a
      // trilha na ordem certa, sem precisar arrastar nada depois.
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

  // Caminho ÚNICO de reordenação: o arrasto manda (de, para) quaisquer e o
  // teclado manda (i, i±1). Só o grupo de cima entra aqui, então tudo que
  // `reordenar` renumera existe em project_stages e pode ser gravado — era
  // essa a armadilha do desenho antigo, em que metade das linhas da lista não
  // tinha onde guardar número.
  async function reordenarEtapa(de, para) {
    const { lista, alterados } = reordenar(doProjeto, de, para)
    if (alterados.length === 0) return

    // OTIMISTA: esperar o PUT com arrasto faz a linha voltar pro lugar antigo
    // e pular de novo quando a resposta chega. Como a lista é do pai, o
    // "na hora" mora aqui até ele devolver a lista nova.
    setPosicoesOtimistas(Object.fromEntries(lista.map((e) => [e.id, e.position])))
    setErroCatalogo('')

    try {
      await Promise.all(alterados.map((e) => (
        api.put(`/projects/${projectId}/stages/${e.id}`, { position: e.position })
      )))
    } catch (err) {
      setErroCatalogo(err.message || 'Não foi possível reordenar as etapas.')
    } finally {
      // Nos dois desfechos: no sucesso para a trilha do topo do projeto
      // acompanhar; no erro porque a meia-falha (um PUT passou, outro não) só
      // o servidor sabe resolver — desfazer no cliente seria chute.
      onChanged?.()
    }
  }

  // HTML5 nativo, mesmo padrão do quadro (KanbanBoard/TaskCard) e do Catálogo
  // de etapas. O projeto não tem biblioteca de drag-and-drop.
  function aoIniciarArrasto(e, etapa) {
    e.dataTransfer.setData('text/plain', etapa.id)
    e.dataTransfer.effectAllowed = 'move'
    setArrastandoId(etapa.id)
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
    // Pelo id, não pelo índice: o pai pode ter recarregado no meio do gesto e
    // um índice velho moveria a etapa errada.
    const de = doProjeto.findIndex((etapa) => etapa.id === id)
    if (de >= 0) reordenarEtapa(de, indice)
  }

  // Teclado não é enfeite: quem chega na alça pelo Tab reordena sem mouse. As
  // bordas já são no-op dentro de `reordenar`, então não precisa de guarda.
  function aoTeclar(e, indice) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault() // senão o modal rola junto com a etapa
    reordenarEtapa(indice, indice + (e.key === 'ArrowUp' ? -1 : 1))
  }

  return (
    <Modal open onClose={onClose} size="xl" title="Gerenciar etapas">
      {erroCatalogo && <p className="text-xs state-danger mb-3">{erroCatalogo}</p>}

      {/* UMA linha por etapa — o modal já listou cada uma DUAS vezes (checkbox
          do catálogo em cima, linha editável embaixo) e isso dobrava a altura
          para gerenciar a mesma coisa. Os dois grupos abaixo não são aquilo de
          volta: nenhuma etapa aparece duas vezes, elas só estão separadas por
          "já é deste projeto" x "ainda não é" — que é a única fronteira em que
          a ordem faz sentido, porque só a de cima tem position para gravar. */}
      <div className="space-y-4">
        {carregandoCatalogo ? (
          <p className="text-xs text-text-secondary">Carregando...</p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="mb-1 flex flex-wrap items-baseline gap-x-2 px-2 text-[10px] uppercase tracking-wider text-text-secondary">
                Etapas deste projeto
                {doProjeto.length > 1 && (
                  <span className="normal-case tracking-normal">
                    arraste pela alça para mudar a ordem da trilha
                  </span>
                )}
              </p>

              {doProjeto.length === 0 ? (
                <p className="border-y border-border-subtle px-2 py-3 text-xs text-text-secondary">
                  Nenhuma etapa ativada ainda. Marque abaixo as que este projeto usa.
                </p>
              ) : (
                <>
                  <div className="hidden sm:grid grid-cols-[1.25rem_minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1.25fr)_1.75rem] gap-2 border-l-2 border-transparent px-2 pb-1 text-[10px] uppercase tracking-wider text-text-secondary">
                    <span /><span>Etapa</span><span>Prazo</span>
                    <span>Responsável</span><span>Status</span><span />
                  </div>
                  <div className="divide-y divide-border-subtle border-y border-border-subtle">
                    {doProjeto.map((etapa, i) => (
                      <Linha
                        key={etapa.id}
                        nome={etapa.name}
                        ativa={etapa}
                        extra={!etapa.catalog_id}
                        ocupado={busyId === etapa.id}
                        onAlternar={() => excluirEtapa(etapa)}
                        users={users}
                        salvarEtapa={salvarEtapa}
                        erro={erroPorEtapa[etapa.id]}
                        ehAlvo={alvoId === etapa.id && arrastandoId !== etapa.id}
                        arrastando={arrastandoId === etapa.id}
                        propsDeArrasto={{
                          // A linha inteira é o que arrasta (o "fantasma" fica
                          // certo), mas só depois que o mouse desce na alça —
                          // senão não dá para marcar o checkbox nem usar os
                          // campos da própria linha.
                          draggable: arrastavelId === etapa.id,
                          onDragStart: (e) => aoIniciarArrasto(e, etapa),
                          onDragEnd: encerrarArrasto,
                          onDragOver: (e) => { e.preventDefault(); setAlvoId(etapa.id) },
                          onDragLeave: () => setAlvoId((cur) => (cur === etapa.id ? null : cur)),
                          onDrop: (e) => aoSoltar(e, i),
                        }}
                        alca={
                          <button
                            type="button"
                            onMouseDown={() => setArrastavelId(etapa.id)}
                            onMouseUp={() => setArrastavelId(null)}
                            onKeyDown={(e) => aoTeclar(e, i)}
                            aria-label={`Arrastar para reordenar a etapa ${etapa.name}`}
                            title="Arraste para reordenar (ou use ↑ e ↓ com a alça focada)"
                            className="cursor-grab text-text-secondary hover:text-text-primary active:cursor-grabbing"
                          >
                            <GripVertical size={14} />
                          </button>
                        }
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            {naoAtivadas.length > 0 && (
              <div>
                <p className="mb-1 px-2 text-[10px] uppercase tracking-wider text-text-secondary">
                  Não ativadas neste projeto
                </p>
                <div className="divide-y divide-border-subtle border-y border-border-subtle">
                  {naoAtivadas.map((item) => (
                    <Linha
                      key={item.id}
                      nome={item.name}
                      ativa={null}
                      ocupado={busyId === item.id}
                      onAlternar={() => ativarDoCatalogo(item)}
                      users={users}
                      salvarEtapa={salvarEtapa}
                      erro={null}
                    />
                  ))}
                </div>
              </div>
            )}
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
