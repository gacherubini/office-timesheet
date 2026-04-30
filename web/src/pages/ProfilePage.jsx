import { useEffect, useRef, useState } from 'react'
import { Camera, Save } from 'lucide-react'
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

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <p className="text-sm text-gray-400">Carregando perfil...</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Meu Perfil</h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie suas informações pessoais.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div className="p-5 border-b flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="relative">
            <Avatar name={form.name || profile?.name} url={form.avatar_url} size={72} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-gray-700 disabled:opacity-50"
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
            <p className="font-semibold text-gray-900 truncate">{form.name}</p>
            <p className="text-sm text-gray-500 truncate">{form.email}</p>
            <span className="inline-flex mt-2 text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-700">
              {roleLabel(form.role)}
            </span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {error && <div className="rounded-md bg-red-50 text-red-700 text-sm p-3">{error}</div>}
          {success && <div className="rounded-md bg-green-50 text-green-700 text-sm p-3">{success}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
              <input
                value={form.email}
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
                disabled
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="(11) 99999-9999"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data de nascimento</label>
              <input
                type="date"
                value={form.birth_date}
                onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
              <input
                value={form.position || 'Não informado'}
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
                disabled
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Perfil</label>
              <input
                value={roleLabel(form.role)}
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
                disabled
              />
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t bg-gray-50 flex justify-end">
          <button
            type="submit"
            disabled={saving || uploading}
            className="inline-flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </div>
  )
}
