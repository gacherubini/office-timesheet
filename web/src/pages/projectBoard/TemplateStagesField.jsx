import { useState } from 'react'
import { Check, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { etapaDoCatalogoJaAdicionada } from './templateStagesLogic'

// Etapas de um template (item 8 do PDF: "o projeto nasce estruturado em vez
// de em branco"). Vizinho mais próximo é StageManagerModal.jsx — mesma ideia
// de catálogo + extra — mas aqui é um RASCUNHO: nada toca a API, tudo some se
// o editor for cancelado sem salvar (é por isso que os handlers vêm de fora,
// como `onAdd`/`onRemove`/`onMove`, em vez deste componente chamar `api.*`
// direto). Componente controlado, mesmo espírito de
// components/pessoas/ContactListField.jsx (`{ itens, onChange }`), só que a
// remoção/reordenação também precisa reindexar `items[].stageIndex` no pai —
// por isso as mutações são ações (onAdd/onRemove/onMove), não um `onChange`
// de lista só.
export function TemplateStagesField({
  stages = [],
  onAdd,
  onRemove,
  onMove,
  catalogo = [],
  carregandoCatalogo = false,
  erroCatalogo = '',
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-xs font-medium text-text-secondary">Catálogo de etapas</p>
        {erroCatalogo && <p className="mb-1.5 text-xs state-danger">{erroCatalogo}</p>}
        {carregandoCatalogo ? (
          <p className="text-xs text-text-secondary">Carregando...</p>
        ) : catalogo.length === 0 ? (
          <p className="text-xs text-text-secondary">Nenhuma etapa no catálogo ainda.</p>
        ) : (
          <div className="border border-border-subtle divide-y divide-border-subtle">
            {catalogo.map((item) => {
              const jaAdicionada = etapaDoCatalogoJaAdicionada(stages, item.id)
              return (
                <label
                  key={item.id}
                  className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-surface-alt"
                >
                  <input
                    type="checkbox"
                    checked={jaAdicionada}
                    disabled={jaAdicionada}
                    onChange={() => onAdd({ catalog_id: item.id, name: item.name })}
                  />
                  <span className="flex-1 text-text-primary">{item.name}</span>
                  {jaAdicionada && <Check size={13} className="text-state-success" />}
                </label>
              )
            })}
          </div>
        )}
      </div>

      <AdicionarEtapaLivre onAdd={onAdd} />

      <div>
        <p className="mb-1.5 text-xs font-medium text-text-secondary">Etapas do template</p>
        {stages.length === 0 ? (
          <p className="text-xs text-text-secondary">
            Nenhuma etapa ainda. Sem etapas, as tasks abaixo nascem sem etapa (como hoje).
          </p>
        ) : (
          <div className="space-y-1.5">
            {stages.map((stage, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 border border-border-subtle px-2.5 py-1.5"
              >
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => onMove(idx, -1)}
                    disabled={idx === 0}
                    className="text-text-secondary hover:text-text-primary disabled:opacity-30"
                    title="Subir"
                    aria-label={`Subir etapa ${stage.name}`}
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(idx, 1)}
                    disabled={idx === stages.length - 1}
                    className="text-text-secondary hover:text-text-primary disabled:opacity-30"
                    title="Descer"
                    aria-label={`Descer etapa ${stage.name}`}
                  >
                    <ChevronDown size={13} />
                  </button>
                </div>
                <span className="flex-1 text-sm text-text-primary">{stage.name}</span>
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  aria-label={`Remover etapa ${stage.name}`}
                  className="p-1 text-text-secondary hover:state-danger"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Campo isolado (com estado local só do texto digitado) pra acrescentar etapa
// fora do catálogo — mesmo padrão do StageManagerModal.jsx (`novoNome`).
function AdicionarEtapaLivre({ onAdd }) {
  const [nome, setNome] = useState('')

  function adicionar() {
    if (!nome.trim()) return
    onAdd({ catalog_id: null, name: nome.trim() })
    setNome('')
  }

  return (
    <div className="flex items-end gap-2">
      <Input
        label="Acrescentar etapa extra"
        placeholder="Ex.: Maquete física"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        className="flex-1"
      />
      <Button type="button" onClick={adicionar} disabled={!nome.trim()}>
        <Plus size={14} /> Adicionar
      </Button>
    </div>
  )
}
