import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { Plus, X, AlertTriangle, Trash2 } from 'lucide-react'

export function AdminTeamPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [error, setError] = useState('')
  const [userToDelete, setUserToDelete] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Form state
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'employee', hourly_rate: '', is_active: true, position: '' })

  async function loadUsers() {
    try {
      const data = await api.get('/admin/users')
      setUsers(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [])

  function resetForm() {
    setForm({ name: '', email: '', password: '', role: 'employee', hourly_rate: '', is_active: true, position: '' })
    setEditingUser(null)
    setShowForm(false)
    setError('')
  }

  function startEdit(user) {
    setForm({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      hourly_rate: user.hourly_rate || '',
      is_active: user.is_active,
      position: user.position || '',
    })
    setEditingUser(user)
    setShowForm(true)
    setError('')
  }

  async function handleDelete() {
    if (!userToDelete) return
    setDeleteError('')
    setDeleting(true)
    try {
      await api.delete(`/admin/users/${userToDelete.id}`)
      setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id))
      setUserToDelete(null)
    } catch (err) {
      setDeleteError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    try {
      if (editingUser) {
        await api.put(`/admin/users/${editingUser.id}`, {
          name: form.name,
          role: form.role,
          hourly_rate: Number(form.hourly_rate) || 0,
          is_active: form.is_active,
          position: form.position,
        })
      } else {
        await api.post('/admin/create-user', {
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          position: form.position,
        })
      }

      resetForm()
      loadUsers()
    } catch (err) {
      setError(err.message)
    }
  }

  function formatCurrency(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Equipe</h1>
        <div className="flex items-center gap-3">
          <Link
            to="/admin/deleted-users"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
          >
            <Trash2 size={14} />
            Excluídos
          </Link>
          <button
            onClick={() => { resetForm(); setShowForm(true) }}
            className="flex items-center gap-1 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            <Plus size={16} />
            Novo Colaborador
          </button>
        </div>
      </div>

      {/* Modal / Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{editingUser ? 'Editar Colaborador' : 'Novo Colaborador'}</h2>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {error && <div className="bg-red-50 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input
                  required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                <input
                  value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })}
                  placeholder="Ex: Arquiteta, Estagiário"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              {!editingUser && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                    <input
                      type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                    <input
                      type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Perfil</label>
                  <select
                    value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="employee">Colaborador</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valor/Hora (R$)</label>
                  <input
                    type="number" step="0.01" min="0" value={form.hourly_rate}
                    onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>

              {editingUser && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox" checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  Ativo
                </label>
              )}

              <button type="submit" className="w-full bg-gray-900 text-white rounded-md py-2 text-sm font-medium hover:bg-gray-800 transition-colors">
                {editingUser ? 'Salvar' : 'Criar Colaborador'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white rounded-lg shadow-sm border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Cargo</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">E-mail</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Perfil</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Valor/Hora</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">Carregando...</td></tr>
            ) : users.map((user) => (
              <tr key={user.id} className="border-b last:border-b-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{user.name}</td>
                <td className="px-4 py-3 text-gray-500">{user.position || '-'}</td>
                <td className="px-4 py-3 text-gray-500">{user.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {user.role === 'admin' ? 'Admin' : 'Colaborador'}
                  </span>
                </td>
                <td className="px-4 py-3">{formatCurrency(user.hourly_rate)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {user.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <button onClick={() => startEdit(user)} className="text-sm text-gray-500 hover:text-gray-900">
                      Editar
                    </button>
                    <button
                      onClick={() => { setUserToDelete(user); setDeleteError('') }}
                      className="text-sm text-red-500 hover:text-red-700"
                    >
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal de confirmação de exclusão */}
      {userToDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-red-50 px-6 py-8 flex flex-col items-center text-center border-b border-red-100">
              <div className="bg-red-100 rounded-full p-4 mb-4">
                <AlertTriangle className="text-red-600" size={40} />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Excluir colaborador?
              </h2>
              <p className="text-gray-600">
                Você está prestes a excluir{' '}
                <strong className="text-gray-900">{userToDelete.name}</strong>
              </p>
            </div>

            <div className="px-6 py-5 space-y-3">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-900">
                <p className="font-medium mb-1">Os apontamentos serão preservados.</p>
                <p className="text-blue-700">
                  Você pode restaurar este colaborador a qualquer momento na página de{' '}
                  <strong>Excluídos</strong>.
                </p>
              </div>

              {deleteError && (
                <div className="bg-red-50 text-red-700 text-sm rounded-md p-3">{deleteError}</div>
              )}
            </div>

            <div className="px-6 py-4 bg-gray-50 flex items-center justify-end gap-3 border-t">
              <button
                onClick={() => { setUserToDelete(null); setDeleteError('') }}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors disabled:opacity-50"
              >
                {deleting ? 'Excluindo...' : 'Sim, excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
