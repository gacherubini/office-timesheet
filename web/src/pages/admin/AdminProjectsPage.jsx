import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { AlertTriangle, Plus, Trash2, Upload } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'
import { Input, Select } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { useAuth } from '../../contexts/AuthContext'

export function AdminProjectsPage() {
  const { isAdmin } = useAuth()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingProject, setEditingProject] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', client: '', status: 'active' })
  const [uploading, setUploading] = useState(null)
  const [projectToDelete, setProjectToDelete] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
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

  useEffect(() => {
    loadProjects()
  }, [])

  function resetForm() {
    setForm({ name: '', client: '', status: 'active' })
    setEditingProject(null)
    setShowForm(false)
    setError('')
  }

  function startEdit(project) {
    setForm({
      name: project.name,
      client: project.client || '',
      status: project.status,
    })
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

  async function handleDelete() {
    if (!projectToDelete) return
    setDeleteError('')
    setDeleting(true)
    try {
      await api.delete(`/projects/${projectToDelete.id}`)
      setProjects((prev) => prev.filter((project) => project.id !== projectToDelete.id))
      setProjectToDelete(null)
    } catch (err) {
      setDeleteError(err.message)
    } finally {
      setDeleting(false)
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
      <PageHeader
        title="Projetos"
        subtitle="Cadastro de projetos e clientes"
        actions={
          <>
            {isAdmin && (
            <Link
              to="/admin/deleted-projects"
              className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              <Trash2 size={14} />
              Excluídos
            </Link>
            )}
            <Button
              onClick={() => {
                resetForm()
                setShowForm(true)
              }}
            >
              <Plus size={16} />
              Novo Projeto
            </Button>
          </>
        }
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />

      <Card padded={false} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-alt">
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Imagem
              </th>
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Nome
              </th>
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Cliente
              </th>
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Status
              </th>
              <th className="text-right px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-10 text-text-secondary">
                  Carregando...
                </td>
              </tr>
            ) : projects.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-10 text-text-secondary">
                  Nenhum projeto cadastrado.
                </td>
              </tr>
            ) : (
              projects.map((project) => (
                <tr
                  key={project.id}
                  className="border-b border-border-subtle last:border-b-0 hover:bg-surface-alt transition-colors"
                >
                  <td className="px-4 py-3">
                    <button
                      onClick={() => triggerUpload(project.id)}
                      className="group relative w-10 h-10 rounded-md overflow-hidden cursor-pointer"
                      title="Clique para trocar a imagem"
                    >
                      {project.image_url ? (
                        <>
                          <img
                            src={project.image_url}
                            alt={project.name}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                            <Upload
                              size={14}
                              className="text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            />
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full bg-surface-alt flex items-center justify-center group-hover:opacity-80 transition-opacity">
                          <Upload size={14} className="text-text-secondary" />
                        </div>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-medium text-text-primary">{project.name}</td>
                  <td className="px-4 py-3 text-text-secondary">{project.client || '-'}</td>
                  <td className="px-4 py-3">
                    <Badge tone={project.status === 'active' ? 'success' : 'neutral'}>
                      {project.status === 'active' ? 'Ativo' : 'Concluído'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right space-x-3">
                    <button
                      onClick={() => startEdit(project)}
                      className="text-sm text-text-secondary hover:text-text-primary transition-colors"
                    >
                      Editar
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => {
                          setProjectToDelete(project)
                          setDeleteError('')
                        }}
                        className="text-sm text-rose-500 hover:text-rose-400 transition-colors"
                      >
                        Excluir
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <Modal
        open={showForm}
        onClose={resetForm}
        title={editingProject ? 'Editar Projeto' : 'Novo Projeto'}
      >
        {error && (
          <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            label="Nome do Projeto"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Cliente"
            value={form.client}
            onChange={(e) => setForm({ ...form, client: e.target.value })}
          />
          <div>
            <Select
              label="Status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="active">Ativo</option>
              <option value="completed">Concluído</option>
            </Select>
          </div>
          <Button type="submit" className="w-full">
            {editingProject ? 'Salvar' : 'Criar Projeto'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={Boolean(projectToDelete)}
        onClose={() => {
          setProjectToDelete(null)
          setDeleteError('')
        }}
        size="lg"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setProjectToDelete(null)
                setDeleteError('')
              }}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Excluindo...' : 'Sim, excluir'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center text-center mb-5">
          <div className="bg-rose-500/15 rounded-full p-4 mb-4">
            <AlertTriangle className="text-rose-500" size={36} />
          </div>
          <h3 className="font-display text-2xl text-text-primary mb-2">
            Excluir projeto?
          </h3>
          <p className="text-text-secondary">
            Você está prestes a excluir{' '}
            <strong className="text-text-primary">{projectToDelete?.name}</strong>
          </p>
        </div>
        <div className="bg-sky-500/10 border border-sky-500/20 rounded-lg p-4 text-sm">
          <p className="font-medium text-text-primary mb-1">
            Os apontamentos serão preservados.
          </p>
          <p className="text-text-secondary">
            Você pode restaurar este projeto a qualquer momento na página de{' '}
            <strong className="text-text-primary">Excluídos</strong>.
          </p>
        </div>
        {deleteError && (
          <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3 mt-3">
            {deleteError}
          </div>
        )}
      </Modal>
    </div>
  )
}
