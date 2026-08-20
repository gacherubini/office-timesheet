import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '../ui/Input'
import { LABELS } from './labels'
import { apenasDigitos } from '../../hooks/useCep'
import { VisibilityToggle } from './VisibilityToggle'

// Lista repetível de endereço (item 2 do PDF), com CEP como primeiro campo
// (item 1). Mesmo contrato controlado do ContactListField: não guarda estado
// de DADO, só devolve a lista nova. `buscar` e `erroCep` vêm de fora (o hook
// useCep é chamado uma vez no formulário pai) para não instanciar um
// AbortController por linha.
export function AddressListField({ itens = [], onChange, readOnly = false, buscar, erroCep, podeRestringir = false }) {
  const sugestoes = LABELS.address || []
  // Qual linha disparou a última busca. É estado de UI, não de dado — por isso
  // vive aqui e não sobe pelo onChange. Existe porque `erroCep` é um estado só
  // para a lista inteira (um hook por formulário): sem saber de quem é o erro,
  // o aviso pintava embaixo de TODOS os endereços, e errar o CEP da obra
  // acusava erro também na residencial. null = nenhuma busca desta sessão.
  const [linhaEmBusca, setLinhaEmBusca] = useState(null)

  function adicionar() {
    onChange([
      ...itens,
      {
        label: sugestoes[0] || '',
        cep: '',
        street: '',
        number: '',
        complement: '',
        district: '',
        city: '',
        uf: '',
        is_primary: itens.length === 0,
      },
    ])
  }

  function alterar(indice, campo, valor) {
    onChange(itens.map((it, i) => (i === indice ? { ...it, [campo]: valor } : it)))
  }

  function marcarPrincipal(indice) {
    onChange(itens.map((it, i) => ({ ...it, is_primary: i === indice })))
  }

  function remover(indice) {
    // A marcação é por ÍNDICE e remover desloca todo mundo abaixo — manter o
    // número faria o aviso mudar de dono e acusar erro numa linha em que
    // ninguém digitou. Soltar é mais barato e mais honesto que remapear.
    setLinhaEmBusca(null)
    const restantes = itens.filter((_, i) => i !== indice)
    if (restantes.length > 0 && !restantes.some((r) => r.is_primary)) {
      restantes[0] = { ...restantes[0], is_primary: true }
    }
    onChange(restantes)
  }

  // Regra do CEP que não pode quebrar: falha nunca bloqueia o salvamento, só
  // mostra um aviso brando, e os campos preenchidos continuam editáveis.
  async function aoSairDoCep(indice, cep) {
    if (!buscar) return
    if (apenasDigitos(cep).length !== 8) return
    setLinhaEmBusca(indice)
    const r = await buscar(cep)
    // Deu certo: some com o aviso de uma tentativa anterior desta mesma linha.
    // Deu errado: a linha continua marcada, e é nela que o aviso aparece.
    if (!r.ok) return // erro já está no hook; a linha continua editável
    setLinhaEmBusca(null)
    onChange(itens.map((it, i) => (i === indice ? { ...it, ...r.dados } : it)))
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="block text-xs font-medium text-text-secondary">Endereços</label>
        {!readOnly && (
          <button
            type="button"
            onClick={adicionar}
            aria-label="Adicionar endereço"
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            <Plus size={12} /> Adicionar endereço
          </button>
        )}
      </div>

      {itens.length === 0 && (
        <p className="text-[11px] text-text-secondary">Nenhum endereço cadastrado.</p>
      )}

      <div className="space-y-3">
        {itens.map((it, i) => (
          <div key={i} className="border border-border-subtle p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="radio"
                name="principal-address"
                checked={Boolean(it.is_primary)}
                onChange={() => marcarPrincipal(i)}
                disabled={readOnly}
                title="Principal (é o que aparece nas listagens)"
                aria-label="Definir este endereço como principal"
              />
              <Input
                list="labels-address"
                aria-label="Rótulo do endereço"
                placeholder="Rótulo"
                value={it.label || ''}
                onChange={(e) => alterar(i, 'label', e.target.value)}
                disabled={readOnly}
                className="w-32"
              />
              {/* Endereço restrito é a linha inteira, não campo a campo — o
                  mesmo raciocínio do ContactListField. */}
              <VisibilityToggle
                restrito={Boolean(it.is_restricted)}
                onChange={(novo) => alterar(i, 'is_restricted', novo)}
                podeEditar={podeRestringir}
              />
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => remover(i)}
                  aria-label="Remover endereço"
                  className="ml-auto p-1 text-text-secondary hover:state-danger"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            {/* O CEP é o PRIMEIRO campo do endereço (item 1 do PDF): ao completar
                8 dígitos, busca e preenche rua/bairro/cidade/UF — mas nada aqui
                trava o formulário nem vira readOnly. */}
            <Input
              aria-label="CEP"
              placeholder="00000-000"
              value={it.cep || ''}
              // O aviso é anunciado como descrição DESTE campo — e só quando é
              // desta linha que ele fala.
              aria-describedby={erroCep && linhaEmBusca === i ? `erro-cep-${i}` : undefined}
              onChange={(e) => {
                const valor = e.target.value
                alterar(i, 'cep', valor)
                if (apenasDigitos(valor).length === 8) aoSairDoCep(i, valor)
              }}
              onBlur={(e) => aoSairDoCep(i, e.target.value)}
              disabled={readOnly}
              className="w-32"
            />
            {erroCep && linhaEmBusca === i && (
              <p id={`erro-cep-${i}`} className="text-[11px] state-attention">{erroCep}</p>
            )}

            <div className="grid grid-cols-3 gap-2">
              <Input
                aria-label="Rua"
                placeholder="Rua"
                value={it.street || ''}
                onChange={(e) => alterar(i, 'street', e.target.value)}
                disabled={readOnly}
                className="col-span-2"
              />
              <Input
                aria-label="Número"
                placeholder="Número"
                value={it.number || ''}
                onChange={(e) => alterar(i, 'number', e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Input
                aria-label="Complemento"
                placeholder="Complemento"
                value={it.complement || ''}
                onChange={(e) => alterar(i, 'complement', e.target.value)}
                disabled={readOnly}
              />
              <Input
                aria-label="Bairro"
                placeholder="Bairro"
                value={it.district || ''}
                onChange={(e) => alterar(i, 'district', e.target.value)}
                disabled={readOnly}
              />
              <Input
                aria-label="Cidade"
                placeholder="Cidade"
                value={it.city || ''}
                onChange={(e) => alterar(i, 'city', e.target.value)}
                disabled={readOnly}
              />
            </div>
            <Input
              aria-label="UF"
              placeholder="UF"
              maxLength={2}
              value={it.uf || ''}
              onChange={(e) => alterar(i, 'uf', e.target.value.toUpperCase())}
              disabled={readOnly}
              className="w-16"
            />
          </div>
        ))}
      </div>

      <datalist id="labels-address">
        {sugestoes.map((s) => <option key={s} value={s} />)}
      </datalist>
    </div>
  )
}
