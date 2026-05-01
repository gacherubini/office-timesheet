import { useState } from 'react'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { Tabs } from '../../components/ui/Tabs'
import { DateRange } from '../../components/ui/DateRange'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function AdminReportsPage() {
  const [tab, setTab] = useState('payroll')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [payrollData, setPayrollData] = useState(null)
  const [projectData, setProjectData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function loadPayroll() {
    if (!startDate || !endDate) {
      setError('Selecione o período.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const data = await api.get(
        `/admin/reports/payroll?start_date=${startDate}&end_date=${endDate}`
      )
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

  return (
    <div>
      <PageHeader title="Relatórios Financeiros" subtitle="Folha de pagamento e custo por projeto" />

      <div className="mb-5">
        <Tabs
          variant="pill"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'payroll', label: 'Folha de Pagamento' },
            { value: 'project', label: 'Custo por Projeto' },
          ]}
        />
      </div>

      <Card className="mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <DateRange from={startDate} to={endDate} onFromChange={setStartDate} onToChange={setEndDate} />
          <Button
            onClick={tab === 'payroll' ? loadPayroll : loadProjectCost}
            disabled={loading}
          >
            {loading ? 'Carregando...' : 'Gerar Relatório'}
          </Button>
        </div>
      </Card>

      {error && (
        <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      {tab === 'payroll' && payrollData && (
        <Card padded={false} className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-surface-alt">
                <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                  Colaborador
                </th>
                <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                  Valor/Hora
                </th>
                <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                  Horas
                </th>
                <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                  Apontamentos
                </th>
                <th className="text-right px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                  Salário
                </th>
                <th className="text-right px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                  Despesas
                </th>
                <th className="text-right px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                  Bônus
                </th>
                <th className="text-right px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
                  Total a Pagar
                </th>
              </tr>
            </thead>
            <tbody>
              {payrollData.payroll.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-text-secondary">
                    Nenhum dado encontrado para o período.
                  </td>
                </tr>
              ) : (
                payrollData.payroll.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-border-subtle last:border-b-0 hover:bg-surface-alt transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-text-primary">{u.name}</td>
                    <td className="px-4 py-3 text-text-secondary tabular-nums">
                      {formatCurrency(u.hourly_rate)}
                    </td>
                    <td className="px-4 py-3 text-text-primary tabular-nums">{u.total_hours}h</td>
                    <td className="px-4 py-3 text-text-secondary">{u.entries_count}</td>
                    <td className="px-4 py-3 text-right text-text-primary tabular-nums">
                      {formatCurrency(u.total_cost)}
                    </td>
                    <td className="px-4 py-3 text-right text-accent tabular-nums">
                      {formatCurrency(u.total_expenses)}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-500 tabular-nums">
                      {formatCurrency(u.total_bonuses)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-text-primary tabular-nums">
                      {formatCurrency(u.total_to_pay)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {payrollData.payroll.length > 0 && (
              <tfoot>
                <tr className="bg-surface-alt border-t-2 border-border-subtle">
                  <td colSpan={7} className="px-4 py-3 font-bold text-text-primary">
                    Total Geral
                  </td>
                  <td className="px-4 py-3 text-right font-bold font-display text-xl tabular-nums text-text-primary">
                    {formatCurrency(payrollData.grand_total)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </Card>
      )}

      {tab === 'project' && projectData && (
        <div className="space-y-4">
          {projectData.projects.length === 0 ? (
            <Card>
              <p className="text-center text-text-secondary py-6">
                Nenhum dado encontrado para o período.
              </p>
            </Card>
          ) : (
            projectData.projects.map((p) => (
              <Card key={p.id}>
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-xl text-text-primary">{p.name}</h3>
                    {p.client && <p className="text-sm text-text-secondary mt-0.5">{p.client}</p>}
                    <div className="mt-2">
                      <Badge tone={p.status === 'active' ? 'success' : 'neutral'}>
                        {p.status === 'active' ? 'Ativo' : 'Concluído'}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-display text-2xl text-text-primary tabular-nums">
                      {formatCurrency(p.total_cost)}
                    </p>
                    <p className="text-sm text-text-secondary tabular-nums">
                      {p.total_hours}h trabalhadas
                    </p>
                  </div>
                </div>

                {p.collaborators.length > 0 && (
                  <div className="border-t border-border-subtle pt-3 mt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary mb-2">
                      Detalhamento por colaborador
                    </p>
                    <div className="space-y-1">
                      {p.collaborators.map((c, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between py-1 text-sm"
                        >
                          <span className="text-text-primary">{c.name}</span>
                          <span className="text-text-secondary tabular-nums">
                            {c.hours}h — {formatCurrency(c.cost)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  )
}
