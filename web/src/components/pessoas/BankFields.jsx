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

export function BankFields({ valor = {}, onChange, readOnly = false }) {
  function alterar(campo, novoValor) {
    onChange({ ...valor, [campo]: novoValor })
  }

  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1.5">Dados bancários</label>
      <div className="grid grid-cols-2 gap-2">
        <input
          aria-label="Banco"
          placeholder="Banco"
          value={valor.bank_name || ''}
          onChange={(e) => alterar('bank_name', e.target.value)}
          disabled={readOnly}
          className="border border-border-subtle bg-bg px-2 py-1.5 text-sm"
        />
        <input
          aria-label="Agência"
          placeholder="Agência"
          value={valor.bank_agency || ''}
          onChange={(e) => alterar('bank_agency', e.target.value)}
          disabled={readOnly}
          className="border border-border-subtle bg-bg px-2 py-1.5 text-sm"
        />
        <input
          aria-label="Conta"
          placeholder="Conta"
          value={valor.bank_account || ''}
          onChange={(e) => alterar('bank_account', e.target.value)}
          disabled={readOnly}
          className="border border-border-subtle bg-bg px-2 py-1.5 text-sm"
        />
        <select
          aria-label="Tipo de conta"
          value={valor.bank_account_type || ''}
          onChange={(e) => alterar('bank_account_type', e.target.value)}
          disabled={readOnly}
          className="border border-border-subtle bg-bg px-2 py-1.5 text-sm"
        >
          {TIPOS_CONTA.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          aria-label="Chave PIX"
          placeholder="Chave PIX"
          value={valor.pix_key || ''}
          onChange={(e) => alterar('pix_key', e.target.value)}
          disabled={readOnly}
          className="col-span-2 border border-border-subtle bg-bg px-2 py-1.5 text-sm"
        />
      </div>
    </div>
  )
}
