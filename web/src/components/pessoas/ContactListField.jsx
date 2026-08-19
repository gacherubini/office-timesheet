import { Plus, Trash2 } from 'lucide-react'
import { LABELS } from './labels'
import { VisibilityToggle } from './VisibilityToggle'

const NOME = {
  phone: { singular: 'telefone', botao: 'Adicionar telefone', titulo: 'Telefones' },
  email: { singular: 'e-mail', botao: 'Adicionar e-mail', titulo: 'E-mails' },
}

// Lista repetível de telefone ou e-mail (item 2 do PDF). Componente controlado:
// não guarda estado, só devolve a lista nova. É o mesmo componente para cliente
// e fornecedor — é o que impede a regra de "principal" de divergir entre as
// duas telas.
export function ContactListField({ tipo, itens = [], onChange, readOnly = false, podeRestringir = false }) {
  const nome = NOME[tipo]
  const sugestoes = LABELS[tipo] || []

  function adicionar() {
    onChange([
      ...itens,
      // A primeira linha nasce principal: a listagem precisa de um, e fazer o
      // usuário marcar quando só existe uma opção é atrito à toa.
      { label: sugestoes[0] || '', value: '', is_primary: itens.length === 0 },
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
    // Se o principal saiu, promove o primeiro que sobrou. Sem isto o formulário
    // mandaria zero principais, o servidor promoveria o primeiro, e o usuário
    // veria o principal pular de linha sozinho depois de salvar.
    if (restantes.length > 0 && !restantes.some((r) => r.is_primary)) {
      restantes[0] = { ...restantes[0], is_primary: true }
    }
    onChange(restantes)
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="block text-xs font-medium text-text-secondary">{nome.titulo}</label>
        {!readOnly && (
          <button
            type="button"
            onClick={adicionar}
            aria-label={nome.botao}
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            <Plus size={12} /> {nome.botao}
          </button>
        )}
      </div>

      {itens.length === 0 && (
        <p className="text-[11px] text-text-secondary">Nenhum {nome.singular} cadastrado.</p>
      )}

      <div className="space-y-2">
        {itens.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name={`principal-${tipo}`}
              checked={Boolean(it.is_primary)}
              onChange={() => marcarPrincipal(i)}
              disabled={readOnly}
              title="Principal (é o que aparece nas listagens)"
              aria-label={`Definir este ${nome.singular} como principal`}
            />
            <input
              list={`labels-${tipo}`}
              aria-label={`Rótulo do ${nome.singular}`}
              placeholder="Rótulo"
              value={it.label || ''}
              onChange={(e) => alterar(i, 'label', e.target.value)}
              disabled={readOnly}
              className="w-32 border border-border-subtle bg-bg px-2 py-1.5 text-sm"
            />
            <input
              aria-label={`Valor do ${nome.singular}`}
              placeholder={tipo === 'email' ? 'nome@dominio.com' : '(11) 99999-0000'}
              value={it.value || ''}
              onChange={(e) => alterar(i, 'value', e.target.value)}
              disabled={readOnly}
              className="flex-1 border border-border-subtle bg-bg px-2 py-1.5 text-sm"
            />
            {/* A restrição vive NA LINHA (is_restricted), não no formulário
                inteiro — cada telefone/e-mail é liberado ou restrito por si. */}
            <VisibilityToggle
              restrito={Boolean(it.is_restricted)}
              onChange={(novo) => alterar(i, 'is_restricted', novo)}
              podeEditar={podeRestringir}
            />
            {!readOnly && (
              <button
                type="button"
                onClick={() => remover(i)}
                aria-label={`Remover ${nome.singular}`}
                className="p-1 text-text-secondary hover:state-danger"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Lista pronta que não impede digitar outro — exatamente o que o PDF pede. */}
      <datalist id={`labels-${tipo}`}>
        {sugestoes.map((s) => <option key={s} value={s} />)}
      </datalist>
    </div>
  )
}
