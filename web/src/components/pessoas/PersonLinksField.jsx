import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { Select } from '../ui/Input'
import { PAPEIS_VINCULO } from './labels'

// Vínculo PJ→PF (item 3 do PDF): "sócio", "responsável técnico" etc. O
// seletor de pessoa é um Select alimentado pelo cadastro existente — NUNCA
// um campo de texto livre. O PDF é explícito: "o vínculo é feito pelo
// cadastro existente, nunca por texto digitado", justamente para evitar a
// mesma pessoa duplicada.
//
// `entity` diz se este formulário é de cliente ou fornecedor: cada lado tem
// sua própria tabela (person_links_mesmo_lado, ver migration 042) e seu
// próprio campo de id (member_client_id / member_supplier_id).
export function PersonLinksField({ entity, itens = [], onChange, excludeId, readOnly = false }) {
  const idField = entity === 'fornecedor' ? 'member_supplier_id' : 'member_client_id'
  const endpoint = entity === 'fornecedor' ? '/admin/suppliers' : '/admin/clients'

  const [opcoes, setOpcoes] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let cancelado = false
    setCarregando(true)
    setErro('')
    api
      .get(endpoint)
      .then((rows) => {
        if (cancelado) return
        // Só PF entra na lista: o PDF fala em "vincular PF" (sócio, financeiro
        // etc.); vincular PJ a PJ não é o caso de uso deste bloco.
        setOpcoes((rows || []).filter((r) => r.person_type === 'pf' && r.id !== excludeId))
      })
      .catch((err) => {
        if (!cancelado) setErro(err.message || 'Não foi possível carregar as pessoas.')
      })
      .finally(() => {
        if (!cancelado) setCarregando(false)
      })
    return () => {
      cancelado = true
    }
  }, [endpoint, excludeId])

  function adicionar() {
    onChange([...itens, { [idField]: '', role: PAPEIS_VINCULO[0].value }])
  }

  function alterar(indice, campo, valor) {
    onChange(itens.map((it, i) => (i === indice ? { ...it, [campo]: valor } : it)))
  }

  function remover(indice) {
    onChange(itens.filter((_, i) => i !== indice))
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="block text-xs font-medium text-text-secondary">Pessoas vinculadas</label>
        {!readOnly && (
          <button
            type="button"
            onClick={adicionar}
            aria-label="Adicionar vínculo"
            disabled={carregando}
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline disabled:opacity-50"
          >
            <Plus size={12} /> Adicionar vínculo
          </button>
        )}
      </div>

      {erro && <p className="text-[11px] state-attention mb-1.5">{erro}</p>}

      {itens.length === 0 && (
        <p className="text-[11px] text-text-secondary">Nenhuma pessoa vinculada.</p>
      )}

      <div className="space-y-2">
        {itens.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <Select
              aria-label="Pessoa"
              value={it[idField] || ''}
              onChange={(e) => alterar(i, idField, e.target.value)}
              disabled={readOnly || carregando}
              className="flex-1"
            >
              <option value="">Selecione a pessoa...</option>
              {opcoes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Papel"
              value={it.role || ''}
              onChange={(e) => alterar(i, 'role', e.target.value)}
              disabled={readOnly}
              // w-52 e não w-44: o Select do projeto gasta mais largura interna
              // que o <select> nativo (padding + chevron), e "Responsável técnico"
              // passou a truncar quando a troca foi feita.
              className="w-52 flex-none"
            >
              {PAPEIS_VINCULO.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
            {!readOnly && (
              <button
                type="button"
                onClick={() => remover(i)}
                aria-label="Remover vínculo"
                className="p-1 text-text-secondary hover:state-danger"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
