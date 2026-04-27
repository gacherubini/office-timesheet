import { useState } from 'react'
import { api } from '../../lib/api'

export function AdminReportsPage() {
  const [tab, setTab] = useState('payroll')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [payrollData, setPayrollData] = useState(null)
  const [projectData, setProjectData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function loadPayroll() {
    if (!startDate || !endDate) { setError('Selecione o período.'); return }
    setError('')
    setLoading(true)
    try {
      const data = await api.get(`/admin/reports/payroll?start_date=${startDate}&end_date=${endDate}`)
      setPayrollData(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadProjectCost() {
    setError('')
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (startDate) params.set('start_date', startDate)
      if (endDate) params.set('end_date', endDate)
      const data = await api.get(`/admin/reports/project-cost?${params}`)
      setProjectData(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function formatCurrency(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Relatórios Financeiros</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('payroll')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'payroll' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Folha de Pagamento
        </button>
        <button
          onClick={() => setTab('project')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'project' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Custo por Projeto
        </button>
      </div>

      {/* Filtro de período */}
      <div className="bg-white rounded-lg shadow-sm border p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">De</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Até</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
        </div>
        <button
          onClick={tab === 'payroll' ? loadPayroll : loadProjectCost}
          disabled={loading}
          className="bg-gray-900 text-white px-4 py-1.5 rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? 'Carregando...' : 'Gerar Relatório'}
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>}

      {/* Folha de Pagamento */}
      {tab === 'payroll' && payrollData && (
        <div className="bg-white rounded-lg shadow-sm border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Colaborador</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Valor/Hora</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Horas</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Apontamentos</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Total a Pagar</th>
              </tr>
            </thead>
            <tbody>
              {payrollData.payroll.map((u) => (
                <tr key={u.id} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3 text-gray-500">{formatCurrency(u.hourly_rate)}</td>
                  <td className="px-4 py-3">{u.total_hours}h</td>
                  <td className="px-4 py-3 text-gray-500">{u.entries_count}</td>
                  <td className="px-4 py-3 text-right font-bold">{formatCurrency(u.total_cost)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2">
                <td colSpan={4} className="px-4 py-3 font-bold">Total Geral</td>
                <td className="px-4 py-3 text-right font-bold text-lg">{formatCurrency(payrollData.grand_total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Custo por Projeto */}
      {tab === 'project' && projectData && (
        <div className="space-y-4">
          {projectData.projects.map((p) => (
            <div key={p.id} className="bg-white rounded-lg shadow-sm border p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-bold">{p.name}</h3>
                  {p.client && <p className="text-sm text-gray-500">{p.client}</p>}
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">{formatCurrency(p.total_cost)}</p>
                  <p className="text-sm text-gray-500">{p.total_hours}h trabalhadas</p>
                </div>
              </div>

              {p.collaborators.length > 0 && (
                <div className="border-t pt-3 mt-3">
                  <p className="text-xs text-gray-400 mb-2">Detalhamento por colaborador</p>
                  {p.collaborators.map((c, i) => (
                    <div key={i} className="flex items-center justify-between py-1 text-sm">
                      <span className="text-gray-600">{c.name}</span>
                      <span className="text-gray-500">{c.hours}h — {formatCurrency(c.cost)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {projectData.projects.length === 0 && (
            <p className="text-center text-gray-400 py-8">Nenhum dado encontrado para o período.</p>
          )}
        </div>
      )}
    </div>
  )
}
