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
import { VisibilityToggle } from './pessoas/VisibilityToggle'
import { CAMPOS_RESTRINGIVEIS_FORM, PADRAO_RESTRITO } from './pessoas/labels'

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
  // Campos escalares hoje marcados como restritos (alimenta restricted_fields
  // no PUT). null em `presentes` = "formulário de criação, nada foi omitido
  // ainda" — todo campo pode ser mostrado.
  const [restritos, setRestritos] = useState(PADRAO_RESTRITO)
  const [presentes, setPresentes] = useState(null)
  const editing = Boolean(supplier)
  const { erro: erroCep, buscar: buscarCep } = useCep()

  // Só o admin vê e mexe nos cadeados — colaborador nem sabe que existem
  // (regra central da Task 7: cadeado desabilitado já seria um aviso).
  function alternarRestricao(campo, novo) {
    setRestritos((prev) => (novo ? [...new Set([...prev, campo])] : prev.filter((c) => c !== campo)))
  }

  // Campo ausente na resposta (removido pelo backend para quem não pode ver)
  // não pode renderizar rótulo — um <Input label="CPF" value=""> seria
  // exatamente o aviso proibido que o DELETE do backend evitou.
  function campoVisivel(campo) {
    return presentes === null || presentes.has(campo)
  }

  useEffect(() => {
    if (!open) return
    setError('')

    if (!supplier) {
      setForm(EMPTY_SUPPLIER_FORM)
      setRestritos(PADRAO_RESTRITO)
      setPresentes(null)
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
        setPresentes(new Set(CAMPOS_RESTRINGIVEIS_FORM.filter((c) => c in ficha)))
        // Admin recebe restricted_fields com o estado real gravado no banco.
        // Não-admin não recebe a chave — mas também não mexe nos cadeados
        // (VisibilityToggle já se esconde via podeEditar), então o fallback
        // ao palpite de criação não importa pra ele.
        setRestritos(ficha.restricted_fields || PADRAO_RESTRITO)
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
    // restricted_fields só vai no corpo se for admin: um colaborador que
    // mandasse a chave levaria 403 (só admin altera a marcação — task 3/4).
    const payload = isAdmin ? { ...form, restricted_fields: restritos } : form
    try {
      if (editing) {
        await api.put(`/admin/suppliers/${supplier.id}`, payload)
      } else {
        await api.post('/admin/suppliers', payload)
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
              {campoVisivel('razao_social') && (
                <div className="flex items-end gap-1">
                  <Input
                    label="Razão social"
                    required
                    className="flex-1"
                    value={form.razao_social}
                    onChange={(e) => setForm({ ...form, razao_social: e.target.value })}
                  />
                  <VisibilityToggle
                    restrito={restritos.includes('razao_social')}
                    onChange={(novo) => alternarRestricao('razao_social', novo)}
                    podeEditar={isAdmin}
                  />
                </div>
              )}
              <Input
                label="Nome fantasia"
                value={form.nome_fantasia}
                onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                {campoVisivel('cnpj') && (
                  <div className="flex items-end gap-1">
                    <Input
                      label="CNPJ"
                      className="flex-1"
                      value={form.cnpj}
                      onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                      placeholder="00.000.000/0000-00"
                    />
                    <VisibilityToggle
                      restrito={restritos.includes('cnpj')}
                      onChange={(novo) => alternarRestricao('cnpj', novo)}
                      podeEditar={isAdmin}
                    />
                  </div>
                )}
                {campoVisivel('inscricao_estadual') && (
                  <div className="flex items-end gap-1">
                    <Input
                      label="Inscrição estadual"
                      className="flex-1"
                      value={form.inscricao_estadual}
                      onChange={(e) => setForm({ ...form, inscricao_estadual: e.target.value })}
                    />
                    <VisibilityToggle
                      restrito={restritos.includes('inscricao_estadual')}
                      onChange={(novo) => alternarRestricao('inscricao_estadual', novo)}
                      podeEditar={isAdmin}
                    />
                  </div>
                )}
              </div>
              {campoVisivel('founded_date') && (
                <div className="flex items-end gap-1">
                  <DateField
                    label="Data de fundação"
                    className="flex-1"
                    value={form.founded_date}
                    onChange={(e) => setForm({ ...form, founded_date: e.target.value })}
                    showYearDropdown
                    showMonthDropdown
                  />
                  <VisibilityToggle
                    restrito={restritos.includes('founded_date')}
                    onChange={(novo) => alternarRestricao('founded_date', novo)}
                    podeEditar={isAdmin}
                  />
                </div>
              )}
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
                {campoVisivel('cpf') && (
                  <div className="flex items-end gap-1">
                    <Input
                      label="CPF"
                      className="flex-1"
                      value={form.cpf}
                      onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                      placeholder="000.000.000-00"
                    />
                    <VisibilityToggle
                      restrito={restritos.includes('cpf')}
                      onChange={(novo) => alternarRestricao('cpf', novo)}
                      podeEditar={isAdmin}
                    />
                  </div>
                )}
                {campoVisivel('rg') && (
                  <div className="flex items-end gap-1">
                    <Input
                      label="RG"
                      className="flex-1"
                      value={form.rg}
                      onChange={(e) => setForm({ ...form, rg: e.target.value })}
                    />
                    <VisibilityToggle
                      restrito={restritos.includes('rg')}
                      onChange={(novo) => alternarRestricao('rg', novo)}
                      podeEditar={isAdmin}
                    />
                  </div>
                )}
              </div>
              {campoVisivel('birth_date') && (
                <div className="flex items-end gap-1">
                  <DateField
                    label="Data de nascimento"
                    className="flex-1"
                    value={form.birth_date}
                    onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
                    showYearDropdown
                    showMonthDropdown
                  />
                  <VisibilityToggle
                    restrito={restritos.includes('birth_date')}
                    onChange={(novo) => alternarRestricao('birth_date', novo)}
                    podeEditar={isAdmin}
                  />
                </div>
              )}
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
            podeRestringir={isAdmin}
          />
          <ContactListField
            tipo="email"
            itens={form.emails}
            onChange={(emails) => setForm({ ...form, emails })}
            podeRestringir={isAdmin}
          />
          <AddressListField
            itens={form.addresses}
            onChange={(addresses) => setForm({ ...form, addresses })}
            buscar={buscarCep}
            erroCep={erroCep}
            podeRestringir={isAdmin}
          />

          <BankFields
            valor={form}
            onChange={(bancarios) => setForm({ ...form, ...bancarios })}
            restritos={restritos}
            onAlternarRestricao={alternarRestricao}
            podeRestringir={isAdmin}
          />

          {isPj && (
            <PersonLinksField
              entity="fornecedor"
              itens={form.links}
              onChange={(links) => setForm({ ...form, links })}
              excludeId={supplier?.id}
            />
          )}

          {campoVisivel('notes') && (
            <div className="flex items-end gap-1">
              <Input
                label="Observações"
                as="textarea"
                rows={4}
                className="flex-1"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
              <VisibilityToggle
                restrito={restritos.includes('notes')}
                onChange={(novo) => alternarRestricao('notes', novo)}
                podeEditar={isAdmin}
              />
            </div>
          )}
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
