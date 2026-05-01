import { useEffect, useRef, useState } from 'react'
import { Camera, KeyRound, Save } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { Avatar } from '../components/Avatar'

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

function roleLabel(role) {
  return role === 'admin' ? 'Administrador' : 'Colaborador'
}

export function ProfilePage() {
  const { profile, updateProfile } = useAuth()
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: '',
    position: '',
    phone: '',
    birth_date: '',
    avatar_url: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  })
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    api.get('/me/profile')
      .then((data) => {
        setForm({
          name: data.name || '',
          email: data.email || '',
          role: data.role || '',
          position: data.position || '',
          phone: data.phone || '',
          birth_date: data.birth_date || '',
          avatar_url: data.avatar_url || '',
        })
        updateProfile(data)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSaving(true)

    try {
      const updated = await api.put('/me/profile', {
        name: form.name,
        phone: form.phone,
        birth_date: form.birth_date,
      })
      setForm((current) => ({
        ...current,
        name: updated.name || '',
        phone: updated.phone || '',
        birth_date: updated.birth_date || '',
        avatar_url: updated.avatar_url || '',
      }))
      updateProfile(updated)
      setSuccess('Perfil atualizado com sucesso.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append('image', file)
    setError('')
    setSuccess('')
    setUploading(true)

    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch(`${API_BASE_URL}/me/profile/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar imagem.')

      setForm((current) => ({ ...current, avatar_url: data.avatar_url || '' }))
      updateProfile(data)
      setSuccess('Foto atualizada com sucesso.')
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setPasswordError('As senhas não coincidem.')
      return
    }

    setPasswordSaving(true)
    try {
      await api.post('/me/password', {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      })
      setPasswordForm({
        current_password: '',
        new_password: '',
        confirm_password: '',
      })
      setPasswordSuccess('Senha alterada com sucesso.')
    } catch (err) {
      setPasswordError(err.message)
    } finally {
      setPasswordSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <p className="text-sm text-text-secondary">Carregando perfil...</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Meu Perfil</h1>
          <p className="text-sm text-text-secondary mt-1">Gerencie suas informações pessoais.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-border-subtle shadow-card overflow-hidden">
        <div className="p-5 border-b border-border-subtle flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="relative">
            <Avatar name={form.name || profile?.name} url={form.avatar_url} size={72} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full text-white flex items-center justify-center hover:opacity-90 disabled:opacity-50 transition-opacity"
              style={{ background: 'var(--color-accent)' }}
              title="Alterar foto"
            >
              <Camera size={15} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
          </div>

          <div className="min-w-0">
            <p className="font-semibold text-text-primary truncate">{form.name}</p>
            <p className="text-sm text-text-secondary truncate">{form.email}</p>
            <span className="inline-flex mt-2 text-xs font-medium px-2 py-0.5 rounded bg-surface-alt text-text-secondary">
              {roleLabel(form.role)}
            </span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {error && <div className="rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm p-3">{error}</div>}
          {success && <div className="rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm p-3">{success}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Nome</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full form-control rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">E-mail</label>
              <input
                value={form.email}
                className="w-full form-control-muted rounded-lg border px-3 py-2 text-sm"
                disabled
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Telefone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="(11) 99999-9999"
                className="w-full form-control rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Data de nascimento</label>
              <input
                type="date"
                value={form.birth_date}
                onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
                className="w-full form-control rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Cargo</label>
              <input
                value={form.position || 'Não informado'}
                className="w-full form-control-muted rounded-lg border px-3 py-2 text-sm"
                disabled
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Perfil</label>
              <input
                value={roleLabel(form.role)}
                className="w-full form-control-muted rounded-lg border px-3 py-2 text-sm"
                disabled
              />
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border-subtle bg-surface-alt flex justify-end">
          <button
            type="submit"
            disabled={saving || uploading}
            className="inline-flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            style={{ background: 'var(--color-accent)' }}
          >
            <Save size={16} />
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </form>

      <form onSubmit={handlePasswordSubmit} className="bg-surface rounded-xl border border-border-subtle shadow-card overflow-hidden mt-5">
        <div className="p-5 border-b border-border-subtle flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[color:var(--color-accent)]/15 text-accent flex items-center justify-center">
            <KeyRound size={18} />
          </div>
          <div>
            <h2 className="font-semibold text-text-primary">Alterar senha</h2>
            <p className="text-sm text-text-secondary">
              Informe sua senha atual para definir uma nova.
            </p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {passwordError && (
            <div className="rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm p-3">
              {passwordError}
            </div>
          )}
          {passwordSuccess && (
            <div className="rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm p-3">
              {passwordSuccess}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Senha atual
              </label>
              <input
                type="password"
                value={passwordForm.current_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                className="w-full form-control rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Nova senha
              </label>
              <input
                type="password"
                minLength={6}
                value={passwordForm.new_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                className="w-full form-control rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Confirmar senha
              </label>
              <input
                type="password"
                minLength={6}
                value={passwordForm.confirm_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                className="w-full form-control rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
                required
              />
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border-subtle bg-surface-alt flex justify-end">
          <button
            type="submit"
            disabled={passwordSaving}
            className="inline-flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            style={{ background: 'var(--color-accent)' }}
          >
            <KeyRound size={16} />
            {passwordSaving ? 'Salvando...' : 'Alterar senha'}
          </button>
        </div>
      </form>
    </div>
  )
}
