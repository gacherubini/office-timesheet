import { VisibilityToggle } from './VisibilityToggle'

// Dados bancários (item 6 do PDF): banco, agência, conta, tipo e chave PIX.
// Controlado, no mesmo espírito dos demais — recebe o objeto `valor` com os
// cinco campos e devolve o objeto inteiro no onChange. A visibilidade deste
// bloco (quem pode ver dado bancário) é decidida por quem usa o componente —
// aqui é só o formulário.
const TIPOS_CONTA = [
  { value: '', label: 'Tipo de conta' },
  { value: 'corrente', label: 'Conta corrente' },
  { value: 'poupanca', label: 'Poupança' },
]

// Um cadeado POR CAMPO bancário (item 6): banco, agência, conta, tipo e PIX
// entram e saem de `restricted_fields` independentemente uns dos outros —
// não é um bloco só. `restritos` é o conjunto (nomes de campo) que veio do
// formulário pai; `onAlternarRestricao` devolve o campo e o novo valor.
export function BankFields({
  valor = {},
  onChange,
  readOnly = false,
  restritos = [],
  onAlternarRestricao,
  podeRestringir = false,
}) {
  function alterar(campo, novoValor) {
    onChange({ ...valor, [campo]: novoValor })
  }

  function restrito(campo) {
    return restritos.includes(campo)
  }

  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1.5">Dados bancários</label>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-1">
          <input
            aria-label="Banco"
            placeholder="Banco"
            value={valor.bank_name || ''}
            onChange={(e) => alterar('bank_name', e.target.value)}
            disabled={readOnly}
            className="flex-1 border border-border-subtle bg-bg px-2 py-1.5 text-sm"
          />
          <VisibilityToggle
            restrito={restrito('bank_name')}
            onChange={(novo) => onAlternarRestricao?.('bank_name', novo)}
            podeEditar={podeRestringir}
          />
        </div>
        <div className="flex items-center gap-1">
          <input
            aria-label="Agência"
            placeholder="Agência"
            value={valor.bank_agency || ''}
            onChange={(e) => alterar('bank_agency', e.target.value)}
            disabled={readOnly}
            className="flex-1 border border-border-subtle bg-bg px-2 py-1.5 text-sm"
          />
          <VisibilityToggle
            restrito={restrito('bank_agency')}
            onChange={(novo) => onAlternarRestricao?.('bank_agency', novo)}
            podeEditar={podeRestringir}
          />
        </div>
        <div className="flex items-center gap-1">
          <input
            aria-label="Conta"
            placeholder="Conta"
            value={valor.bank_account || ''}
            onChange={(e) => alterar('bank_account', e.target.value)}
            disabled={readOnly}
            className="flex-1 border border-border-subtle bg-bg px-2 py-1.5 text-sm"
          />
          <VisibilityToggle
            restrito={restrito('bank_account')}
            onChange={(novo) => onAlternarRestricao?.('bank_account', novo)}
            podeEditar={podeRestringir}
          />
        </div>
        <div className="flex items-center gap-1">
          <select
            aria-label="Tipo de conta"
            value={valor.bank_account_type || ''}
            onChange={(e) => alterar('bank_account_type', e.target.value)}
            disabled={readOnly}
            className="flex-1 border border-border-subtle bg-bg px-2 py-1.5 text-sm"
          >
            {TIPOS_CONTA.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <VisibilityToggle
            restrito={restrito('bank_account_type')}
            onChange={(novo) => onAlternarRestricao?.('bank_account_type', novo)}
            podeEditar={podeRestringir}
          />
        </div>
        <div className="col-span-2 flex items-center gap-1">
          <input
            aria-label="Chave PIX"
            placeholder="Chave PIX"
            value={valor.pix_key || ''}
            onChange={(e) => alterar('pix_key', e.target.value)}
            disabled={readOnly}
            className="flex-1 border border-border-subtle bg-bg px-2 py-1.5 text-sm"
          />
          <VisibilityToggle
            restrito={restrito('pix_key')}
            onChange={(novo) => onAlternarRestricao?.('pix_key', novo)}
            podeEditar={podeRestringir}
          />
        </div>
      </div>
    </div>
  )
}
