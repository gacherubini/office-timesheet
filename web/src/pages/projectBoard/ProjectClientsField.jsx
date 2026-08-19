import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'

// Papéis aceitos pelo backend (PAPEIS_CLIENTE em src/routes/clients.js).
const PAPEIS_CLIENTE = [
  { value: 'contratante_principal', label: 'Contratante principal' },
  { value: 'contratante', label: 'Contratante' },
  { value: 'investidor', label: 'Investidor' },
  { value: 'representante', label: 'Representante' },
]

// Lista repetível de contratantes do projeto (item 7 do PDF: "cadastro um
// projeto com dois contratantes; ambos aparecem no projeto e o projeto
// aparece na ficha dos dois"). Componente controlado, mesmo contrato dos
// campos de web/src/components/pessoas/ (`{ itens, onChange }`): não guarda
// estado próprio, só devolve a lista nova.
//
// O seletor de cliente é sobre o cadastro existente — nunca texto livre,
// mesma regra do PersonLinksField — para não duplicar cliente por digitação.
export function ProjectClientsField({ itens = [], onChange, readOnly = false }) {
  const [opcoes, setOpcoes] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let cancelado = false
    setCarregando(true)
    setErro('')
    api
      .get('/admin/clients')
      .then((rows) => {
        if (!cancelado) setOpcoes(rows || [])
      })
      .catch((err) => {
        if (!cancelado) setErro(err.message || 'Não foi possível carregar os clientes.')
      })
      .finally(() => {
        if (!cancelado) setCarregando(false)
      })
    return () => {
      cancelado = true
    }
  }, [])

  function adicionar() {
    onChange([
      ...itens,
      // O primeiro item nasce principal: com uma opção só, fazer o usuário
      // marcar é atrito à toa (mesma regra do ContactListField).
      { client_id: '', role: 'contratante', is_primary: itens.length === 0 },
    ])
  }

  function alterar(indice, campo, valor) {
    onChange(itens.map((it, i) => (i === indice ? { ...it, [campo]: valor } : it)))
  }

  function marcarPrincipal(indice) {
    onChange(itens.map((it, i) => ({ ...it, is_primary: i === indice })))
  }

  function remover(indice) {
    const restantes = itens.filter((_, i) => i !== indice)
    // Se o principal saiu, promove o primeiro que sobrou — mesma lógica do
    // ContactListField, para o principal não "pular" de linha sozinho depois
    // de salvar (o servidor faria essa promoção de qualquer forma).
    if (restantes.length > 0 && !restantes.some((r) => r.is_primary)) {
      restantes[0] = { ...restantes[0], is_primary: true }
    }
    onChange(restantes)
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="block text-xs font-medium text-text-secondary">Contratantes</label>
        {!readOnly && (
          <button
            type="button"
            onClick={adicionar}
            aria-label="Adicionar contratante"
            disabled={carregando}
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline disabled:opacity-50"
          >
            <Plus size={12} /> Adicionar contratante
          </button>
        )}
      </div>

      {erro && <p className="text-[11px] state-attention mb-1.5">{erro}</p>}

      {itens.length === 0 && (
        <p className="text-[11px] text-text-secondary">Nenhum contratante adicionado.</p>
      )}

      <div className="space-y-2">
        {itens.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name="principal-cliente-projeto"
              checked={Boolean(it.is_primary)}
              onChange={() => marcarPrincipal(i)}
              disabled={readOnly}
              title="Principal (é o que aparece no cabeçalho do projeto)"
              aria-label="Definir este contratante como principal"
            />
            <select
              aria-label="Cliente"
              value={it.client_id || ''}
              onChange={(e) => alterar(i, 'client_id', e.target.value)}
              disabled={readOnly || carregando}
              className="flex-1 border border-border-subtle bg-bg px-2 py-1.5 text-sm"
            >
              <option value="">Selecione o cliente...</option>
              {opcoes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              aria-label="Papel"
              value={it.role || 'contratante'}
              onChange={(e) => alterar(i, 'role', e.target.value)}
              disabled={readOnly}
              className="w-44 border border-border-subtle bg-bg px-2 py-1.5 text-sm"
            >
              {PAPEIS_CLIENTE.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            {!readOnly && (
              <button
                type="button"
                onClick={() => remover(i)}
                aria-label="Remover contratante"
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

export { PAPEIS_CLIENTE }
