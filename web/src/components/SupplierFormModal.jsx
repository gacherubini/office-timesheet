import { useState, useEffect } from 'react'
import { Lock } from 'lucide-react'
import { api } from '../lib/api'
import { Modal } from './ui/Modal'
import { Input } from './ui/Input'
import { DateField } from './ui/DateField'
import { Button } from './ui/Button'
import { useCep } from '../hooks/useCep'
import { ContactListField } from './pessoas/ContactListField'
import { AddressListField } from './pessoas/AddressListField'
import { PersonTypeToggle } from './pessoas/PersonTypeToggle'
import { PersonLinksField } from './pessoas/PersonLinksField'
import { BankFields } from './pessoas/BankFields'

// Estado do formulário unificado PF/PJ (item 3 do PDF de ajustes de
// 18/08/2026), com contatos múltiplos (item 2), CEP (item 1) e dados
// bancários (item 6). Espelha EMPTY_CLIENT_FORM; fornecedor ganha `category`.
const EMPTY_SUPPLIER_FORM = {
  person_type: 'pf',
  name: '',
  category: '',
  cpf: '',
  rg: '',
  birth_date: '',
  razao_social: '',
  nome_fantasia: '',
  cnpj: '',
  inscricao_estadual: '',
  founded_date: '',
  bank_name: '',
  bank_agency: '',
  bank_account: '',
  bank_account_type: '',
  pix_key: '',
  notes: '',
  admin_only: false,
  phones: [],
  emails: [],
  addresses: [],
  links: [],
}

// Cadastro de fornecedor in-page (portado da antiga página "Fornecedores"),
// agora PF/PJ com contatos múltiplos, CEP e vínculos. Mantém os mesmos
// endpoints. Fornecedores não têm anexos.
export function SupplierFormModal({ open, supplier, isAdmin, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_SUPPLIER_FORM)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingFicha, setLoadingFicha] = useState(false)
  const editing = Boolean(supplier)
  const { erro: erroCep, buscar: buscarCep } = useCep()

  useEffect(() => {
    if (!open) return
    setError('')

    if (!supplier) {
      setForm(EMPTY_SUPPLIER_FORM)
      return
    }

    // A listagem só traz os contatos principais; a ficha completa (com as
    // listas inteiras) precisa do GET por id.
    let cancelado = false
    setLoadingFicha(true)
    api
      .get(`/admin/suppliers/${supplier.id}`)
      .then((ficha) => {
        if (cancelado) return
        setForm({
          person_type: ficha.person_type || 'pf',
          name: ficha.name || '',
          category: ficha.category || '',
          cpf: ficha.cpf || '',
          rg: ficha.rg || '',
          birth_date: ficha.birth_date || '',
          razao_social: ficha.razao_social || '',
          nome_fantasia: ficha.nome_fantasia || '',
          cnpj: ficha.cnpj || '',
          inscricao_estadual: ficha.inscricao_estadual || '',
          founded_date: ficha.founded_date || '',
          bank_name: ficha.bank_name || '',
          bank_agency: ficha.bank_agency || '',
          bank_account: ficha.bank_account || '',
          bank_account_type: ficha.bank_account_type || '',
          pix_key: ficha.pix_key || '',
          notes: ficha.notes || '',
          admin_only: Boolean(ficha.admin_only),
          phones: ficha.phones || [],
          emails: ficha.emails || [],
          addresses: ficha.addresses || [],
          links: ficha.links || [],
        })
      })
      .catch((err) => {
        if (!cancelado) setError(err.message)
      })
      .finally(() => {
        if (!cancelado) setLoadingFicha(false)
      })
    return () => {
      cancelado = true
    }
  }, [open, supplier])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/admin/suppliers/${supplier.id}`, form)
      } else {
        await api.post('/admin/suppliers', form)
      }
      onSaved(editing ? 'Fornecedor atualizado com sucesso!' : 'Fornecedor cadastrado com sucesso!')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const isPj = form.person_type === 'pj'

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose()
      }}
      closeOnBackdrop={false}
      size="lg"
      title={editing ? 'Editar Fornecedor' : 'Novo Fornecedor'}
    >
      {error && (
        <div className="state-danger-soft text-sm p-3 mb-4">{error}</div>
      )}
      {loadingFicha ? (
        <p className="text-center py-8 text-text-secondary text-sm">Carregando ficha...</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <PersonTypeToggle
            valor={form.person_type}
            onChange={(person_type) => setForm({ ...form, person_type })}
          />

          {isPj ? (
            <>
              <Input
                label="Razão social"
                required
                value={form.razao_social}
                onChange={(e) => setForm({ ...form, razao_social: e.target.value })}
              />
              <Input
                label="Nome fantasia"
                value={form.nome_fantasia}
                onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="CNPJ"
                  value={form.cnpj}
                  onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                  placeholder="00.000.000/0000-00"
                />
                <Input
                  label="Inscrição estadual"
                  value={form.inscricao_estadual}
                  onChange={(e) => setForm({ ...form, inscricao_estadual: e.target.value })}
                />
              </div>
              <DateField
                label="Data de fundação"
                value={form.founded_date}
                onChange={(e) => setForm({ ...form, founded_date: e.target.value })}
                showYearDropdown
                showMonthDropdown
              />
            </>
          ) : (
            <>
              <Input
                label="Nome"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="CPF"
                  value={form.cpf}
                  onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                  placeholder="000.000.000-00"
                />
                <Input
                  label="RG"
                  value={form.rg}
                  onChange={(e) => setForm({ ...form, rg: e.target.value })}
                />
              </div>
              <DateField
                label="Data de nascimento"
                value={form.birth_date}
                onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
                showYearDropdown
                showMonthDropdown
              />
            </>
          )}

          <Input
            label="Categoria"
            placeholder="Ex: Software, Materiais, Serviços"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />

          <ContactListField
            tipo="phone"
            itens={form.phones}
            onChange={(phones) => setForm({ ...form, phones })}
          />
          <ContactListField
            tipo="email"
            itens={form.emails}
            onChange={(emails) => setForm({ ...form, emails })}
          />
          <AddressListField
            itens={form.addresses}
            onChange={(addresses) => setForm({ ...form, addresses })}
            buscar={buscarCep}
            erroCep={erroCep}
          />

          <BankFields
            valor={form}
            onChange={(bancarios) => setForm({ ...form, ...bancarios })}
          />

          {isPj && (
            <PersonLinksField
              entity="fornecedor"
              itens={form.links}
              onChange={(links) => setForm({ ...form, links })}
              excludeId={supplier?.id}
            />
          )}

          <Input
            label="Observações"
            as="textarea"
            rows={4}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          {isAdmin && (
            <label className="flex items-start gap-2.5 border border-border-subtle p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.admin_only}
                onChange={(e) => setForm({ ...form, admin_only: e.target.checked })}
                className="mt-0.5"
              />
              <span className="text-sm">
                <span className="inline-flex items-center gap-1.5 font-medium text-text-primary">
                  <Lock size={13} /> Visível só para admins
                </span>
                <span className="block text-xs text-text-secondary">
                  Colaboradores não veem este fornecedor.
                </span>
              </span>
            </label>
          )}
          <Button type="submit" className="w-full" disabled={saving}>
            {saving
              ? editing
                ? 'Salvando...'
                : 'Criando...'
              : editing
                ? 'Salvar'
                : 'Criar Fornecedor'}
          </Button>
        </form>
      )}
    </Modal>
  )
}
