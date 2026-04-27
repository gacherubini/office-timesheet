import { useState, useEffect, useRef } from 'react'
import { api } from '../../lib/api'
import { Plus, X, Upload, Image } from 'lucide-react'

export function AdminProjectsPage() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingProject, setEditingProject] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', client: '', status: 'active' })
  const [uploading, setUploading] = useState(null) // project id being uploaded
  const fileInputRef = useRef(null)

  async function loadProjects() {
    try {
      const data = await api.get('/projects')
      setProjects(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadProjects() }, [])

  function resetForm() {
    setForm({ name: '', client: '', status: 'active' })
    setEditingProject(null)
    setShowForm(false)
    setError('')
  }

  function startEdit(project) {
    setForm({ name: project.name, client: project.client || '', status: project.status })
    setEditingProject(project)
    setShowForm(true)
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    try {
      if (editingProject) {
        await api.put(`/projects/${editingProject.id}`, form)
      } else {
        await api.post('/projects', form)
      }
      resetForm()
      loadProjects()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(project) {
    if (!confirm(`Excluir o projeto "${project.name}"?`)) return

    try {
      await api.delete(`/projects/${project.id}`)
      loadProjects()
    } catch (err) {
      alert(err.message)
    }
  }

  function triggerUpload(projectId) {
    setUploading(projectId)
    fileInputRef.current?.click()
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !uploading) return

    const formData = new FormData()
    formData.append('image', file)

    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch(`/api/projects/${uploading}/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      loadProjects()
    } catch (err) {
      alert(err.message || 'Erro ao enviar imagem.')
    } finally {
      setUploading(null)
      e.target.value = ''
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Projetos</h1>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-1 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          <Plus size={16} />
          Novo Projeto
        </button>
      </div>

      {/* Input de arquivo escondido */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{editingProject ? 'Editar Projeto' : 'Novo Projeto'}</h2>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {error && <div className="bg-red-50 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Projeto</label>
                <input
                  required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                <input
                  value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="active">Ativo</option>
                  <option value="completed">Concluido</option>
                </select>
              </div>
              <button type="submit" className="w-full bg-gray-900 text-white rounded-md py-2 text-sm font-medium hover:bg-gray-800 transition-colors">
                {editingProject ? 'Salvar' : 'Criar Projeto'}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Imagem</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Carregando...</td></tr>
            ) : projects.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Nenhum projeto cadastrado.</td></tr>
            ) : projects.map((project) => (
              <tr key={project.id} className="border-b last:border-b-0 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <button
                    onClick={() => triggerUpload(project.id)}
                    className="group relative w-10 h-10 rounded-md overflow-hidden cursor-pointer"
                    title="Clique para trocar a imagem"
                  >
                    {project.image_url ? (
                      <>
                        <img src={project.image_url} alt={project.name} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                          <Upload size={14} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full bg-gray-100 flex items-center justify-center group-hover:bg-gray-200 transition-colors">
                        <Upload size={14} className="text-gray-400" />
                      </div>
                    )}
                  </button>
                </td>
                <td className="px-4 py-3 font-medium">{project.name}</td>
                <td className="px-4 py-3 text-gray-500">{project.client || '-'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${project.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {project.status === 'active' ? 'Ativo' : 'Concluido'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right space-x-3">
                  <button onClick={() => startEdit(project)} className="text-sm text-gray-500 hover:text-gray-900">Editar</button>
                  <button onClick={() => handleDelete(project)} className="text-sm text-red-500 hover:text-red-700">Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
