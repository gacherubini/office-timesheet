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

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('pt-BR')
}

function formatDuration(minutes) {
  const total = Number(minutes) || 0
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${h}h ${String(m).padStart(2, '0')}m`
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusLabel(status) {
  if (status === 'approved') return 'Aprovada'
  if (status === 'pending') return 'Pendente'
  if (status === 'rejected') return 'Rejeitada'
  return status || '-'
}

function statusTone(status) {
  if (status === 'approved') return 'success'
  if (status === 'pending') return 'warning'
  if (status === 'rejected') return 'danger'
  return 'neutral'
}

function SummaryCard({ label, value, detail, tone = 'default' }) {
  const toneClass =
    tone === 'success'
      ? 'state-success'
      : tone === 'warning'
        ? 'state-attention'
        : 'text-text-primary'

  return (
    <Card>
      <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">
        {label}
      </p>
      <p className={`font-display text-2xl mt-2 tabular-nums ${toneClass}`}>{value}</p>
      {detail && <p className="text-xs text-text-secondary mt-1">{detail}</p>}
    </Card>
  )
}

function EmptyRow({ colSpan, children = 'Nenhum dado encontrado para o período.' }) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-center py-10 text-text-secondary">
        {children}
      </td>
    </tr>
  )
}

const headerClass = 'text-left px-4 py-2 text-[8.5px] uppercase tracking-[.2em] text-text-secondary'
const rightHeaderClass =
  'text-right px-4 py-2 text-[8.5px] uppercase tracking-[.2em] text-text-secondary'
const rowClass =
  'border-b border-border-subtle last:border-b-0 hover:bg-[color:var(--color-hover)] transition-colors'

export function AdminReportsPage() {
  const [tab, setTab] = useState('overview')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [financialData, setFinancialData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function loadFinancialReport() {
    if (!startDate || !endDate) {
      setError('Selecione o período.')
      return
    }

    setError('')
    setLoading(true)
    try {
      const data = await api.get(
        `/admin/reports/financial?start_date=${startDate}&end_date=${endDate}`
      )
      setFinancialData(data)
      setTab('overview')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const summary = financialData?.summary

  return (
    <div>
      <PageHeader
        title="Relatório Financeiro"
        subtitle="Custos, pagamentos, despesas, bônus e distribuição por projeto"
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <DateRange
          size="sm"
          from={startDate}
          to={endDate}
          onFromChange={setStartDate}
          onToChange={setEndDate}
          fromLabel=""
          toLabel=""
        />

        {financialData && (
          <Tabs
            variant="pill"
            value={tab}
            onChange={setTab}
            items={[
              { value: 'overview', label: 'Resumo' },
              { value: 'users', label: 'Colaboradores' },
              { value: 'projects', label: 'Projetos' },
              { value: 'daily-hours', label: 'Horas por Dia' },
              { value: 'entries', label: 'Apontamentos' },
              { value: 'expenses', label: 'Despesas' },
              { value: 'bonuses', label: 'Bônus' },
            ]}
          />
        )}

        <Button className="ml-auto h-8" onClick={loadFinancialReport} disabled={loading}>
          {loading ? 'Carregando...' : 'Gerar Relatório'}
        </Button>
      </div>

      {error && (
        <div className="state-danger-soft text-sm p-3 mb-4">
          {error}
        </div>
      )}

      {!financialData ? (
        <Card>
          <p className="text-center text-text-secondary py-8">
            Selecione um período para gerar o relatório financeiro.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
            <SummaryCard
              label="Total a pagar"
              value={formatCurrency(summary.total_payable)}
              detail="Horas + despesas aprovadas + bônus"
              tone="success"
            />
            <SummaryCard
              label="Custo de horas"
              value={formatCurrency(summary.hours_cost)}
              detail={`${summary.total_hours}h trabalhadas`}
            />
            <SummaryCard
              label="Despesas aprovadas"
              value={formatCurrency(summary.approved_expenses)}
              detail={`${formatCurrency(summary.pending_expenses)} pendentes`}
              tone={summary.pending_expenses > 0 ? 'warning' : 'default'}
            />
            <SummaryCard
              label="Bônus"
              value={formatCurrency(summary.bonuses)}
              detail={`${summary.active_people} pessoas com movimentação`}
            />
          </div>

          {financialData.alerts.length > 0 && (
            <div className="space-y-2 mb-5">
              {financialData.alerts.map((alert, index) => (
                <div
                  key={`${alert.message}-${index}`}
                  className="state-attention-soft text-sm p-3"
                >
                  {alert.message}
                </div>
              ))}
            </div>
          )}

          {tab === 'overview' && (
            <div className="grid lg:grid-cols-2 gap-4">
              <Card padded={false} className="overflow-x-auto">
                <div className="px-4 py-3 border-b border-border-subtle">
                  <h2 className="font-display text-lg text-text-primary">
                    Maiores pagamentos
                  </h2>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle bg-bg">
                      <th className={headerClass}>Colaborador</th>
                      <th className={rightHeaderClass}>Horas</th>
                      <th className={rightHeaderClass}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financialData.by_user.length === 0 ? (
                      <EmptyRow colSpan={3} />
                    ) : (
                      financialData.by_user.slice(0, 6).map((user) => (
                        <tr key={user.id} className={rowClass}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-text-primary">{user.name}</p>
                            <p className="text-xs text-text-secondary">{user.position || '-'}</p>
                          </td>
                          <td className="px-4 py-3 text-right text-text-secondary tabular-nums">
                            {user.total_hours}h
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-text-primary tabular-nums">
                            {formatCurrency(user.total_payable)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </Card>

              <Card padded={false} className="overflow-x-auto">
                <div className="px-4 py-3 border-b border-border-subtle">
                  <h2 className="font-display text-lg text-text-primary">
                    Projetos com maior custo
                  </h2>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle bg-bg">
                      <th className={headerClass}>Projeto</th>
                      <th className={rightHeaderClass}>Horas</th>
                      <th className={rightHeaderClass}>Custo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financialData.by_project.length === 0 ? (
                      <EmptyRow colSpan={3} />
                    ) : (
                      financialData.by_project.slice(0, 6).map((project) => (
                        <tr key={project.id} className={rowClass}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-text-primary">{project.name}</p>
                            <p className="text-xs text-text-secondary">{project.client || '-'}</p>
                          </td>
                          <td className="px-4 py-3 text-right text-text-secondary tabular-nums">
                            {project.total_hours}h
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-text-primary tabular-nums">
                            {formatCurrency(project.total_cost)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </Card>
            </div>
          )}

          {tab === 'users' && (
            <Card padded={false} className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle bg-bg">
                    <th className={headerClass}>Colaborador</th>
                    <th className={rightHeaderClass}>Horas</th>
                    <th className={rightHeaderClass}>Custo horas</th>
                    <th className={rightHeaderClass}>Despesas aprovadas</th>
                    <th className={rightHeaderClass}>Despesas pendentes</th>
                    <th className={rightHeaderClass}>Bônus</th>
                    <th className={rightHeaderClass}>Total a pagar</th>
                  </tr>
                </thead>
                <tbody>
                  {financialData.by_user.length === 0 ? (
                    <EmptyRow colSpan={7} />
                  ) : (
                    financialData.by_user.map((user) => (
                      <tr key={user.id} className={rowClass}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-text-primary">{user.name}</p>
                          <p className="text-xs text-text-secondary">
                            {user.position || '-'} · {user.working_days} dia(s) · {user.projects_count} projeto(s)
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right text-text-primary tabular-nums">
                          {user.total_hours}h
                        </td>
                        <td className="px-4 py-3 text-right text-text-primary tabular-nums">
                          {formatCurrency(user.hours_cost)}
                        </td>
                        <td className="px-4 py-3 text-right text-text-primary tabular-nums">
                          {formatCurrency(user.approved_expenses)}
                        </td>
                        <td className="px-4 py-3 text-right state-attention tabular-nums">
                          {formatCurrency(user.pending_expenses)}
                        </td>
                        <td className="px-4 py-3 text-right state-success tabular-nums">
                          {formatCurrency(user.bonuses)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-text-primary tabular-nums">
                          {formatCurrency(user.total_payable)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Card>
          )}

          {tab === 'projects' && (
            <Card padded={false} className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle bg-bg">
                    <th className={headerClass}>Projeto</th>
                    <th className={headerClass}>Status</th>
                    <th className={rightHeaderClass}>Horas</th>
                    <th className={rightHeaderClass}>Custo</th>
                    <th className={rightHeaderClass}>Custo médio/h</th>
                    <th className={rightHeaderClass}>% do custo</th>
                  </tr>
                </thead>
                <tbody>
                  {financialData.by_project.length === 0 ? (
                    <EmptyRow colSpan={6} />
                  ) : (
                    financialData.by_project.map((project) => (
                      <tr key={project.id} className={rowClass}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-text-primary">{project.name}</p>
                          <p className="text-xs text-text-secondary">
                            {project.client || '-'} · {project.collaborators_count} colaborador(es)
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={project.status === 'active' ? 'success' : 'neutral'}>
                            {project.status === 'active' ? 'Ativo' : 'Concluído'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right text-text-primary tabular-nums">
                          {project.total_hours}h
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-text-primary tabular-nums">
                          {formatCurrency(project.total_cost)}
                        </td>
                        <td className="px-4 py-3 text-right text-text-secondary tabular-nums">
                          {formatCurrency(project.average_hour_cost)}
                        </td>
                        <td className="px-4 py-3 text-right text-text-secondary tabular-nums">
                          {project.percent_of_hours_cost}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Card>
          )}

          {tab === 'daily-hours' && (
            <Card padded={false} className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle bg-bg">
                    <th className={headerClass}>Data</th>
                    <th className={headerClass}>Colaborador</th>
                    <th className={headerClass}>Projetos</th>
                    <th className={rightHeaderClass}>Apontamentos</th>
                    <th className={rightHeaderClass}>Horas no dia</th>
                    <th className={rightHeaderClass}>Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {(financialData.daily_hours || []).length === 0 ? (
                    <EmptyRow colSpan={6} />
                  ) : (
                    financialData.daily_hours.map((day) => (
                      <tr key={day.id} className={rowClass}>
                        <td className="px-4 py-3 text-text-secondary">
                          {formatDate(day.date)}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-text-primary">
                            {day.profile?.name || 'Desconhecido'}
                          </p>
                          <p className="text-xs text-text-secondary">
                            {day.profile?.position || day.profile?.email || '-'}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-text-primary">
                            {day.projects?.[0]?.name || 'Sem projeto'}
                          </p>
                          <p className="text-xs text-text-secondary">
                            {day.projects_count > 1
                              ? `+${day.projects_count - 1} projeto(s)`
                              : day.projects?.[0]?.client || '-'}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right text-text-secondary tabular-nums">
                          {day.entries_count}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-text-primary tabular-nums">
                          {formatDuration(day.total_minutes)}
                        </td>
                        <td className="px-4 py-3 text-right text-text-primary tabular-nums">
                          {formatCurrency(day.total_cost)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Card>
          )}

          {tab === 'entries' && (
            <Card padded={false} className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle bg-bg">
                    <th className={headerClass}>Data</th>
                    <th className={headerClass}>Colaborador</th>
                    <th className={headerClass}>Projeto</th>
                    <th className={rightHeaderClass}>Horas</th>
                    <th className={rightHeaderClass}>Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {financialData.entries.length === 0 ? (
                    <EmptyRow colSpan={5} />
                  ) : (
                    financialData.entries.map((entry) => (
                      <tr key={entry.id} className={rowClass}>
                        <td className="px-4 py-3 text-text-secondary">
                          {formatDateTime(entry.started_at)}
                        </td>
                        <td className="px-4 py-3 text-text-primary">
                          {entry.profile?.name || 'Desconhecido'}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-text-primary">{entry.project?.name || 'Sem projeto'}</p>
                          <p className="text-xs text-text-secondary">{entry.project?.client || '-'}</p>
                        </td>
                        <td className="px-4 py-3 text-right text-text-primary tabular-nums">
                          {entry.hours}h
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-text-primary tabular-nums">
                          {formatCurrency(entry.cost)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Card>
          )}

          {tab === 'expenses' && (
            <Card padded={false} className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle bg-bg">
                    <th className={headerClass}>Data</th>
                    <th className={headerClass}>Colaborador</th>
                    <th className={headerClass}>Despesa</th>
                    <th className={headerClass}>Status</th>
                    <th className={rightHeaderClass}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {financialData.expenses.length === 0 ? (
                    <EmptyRow colSpan={5} />
                  ) : (
                    financialData.expenses.map((expense) => (
                      <tr key={expense.id} className={rowClass}>
                        <td className="px-4 py-3 text-text-secondary">
                          {formatDate(expense.expense_date)}
                        </td>
                        <td className="px-4 py-3 text-text-primary">
                          {expense.profile?.name || 'Desconhecido'}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-text-primary">{expense.title}</p>
                          <p className="text-xs text-text-secondary">{expense.description || '-'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={statusTone(expense.status)}>
                            {statusLabel(expense.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-text-primary tabular-nums">
                          {formatCurrency(expense.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Card>
          )}

          {tab === 'bonuses' && (
            <Card padded={false} className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle bg-bg">
                    <th className={headerClass}>Data</th>
                    <th className={headerClass}>Colaborador</th>
                    <th className={headerClass}>Bônus</th>
                    <th className={rightHeaderClass}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {financialData.bonuses.length === 0 ? (
                    <EmptyRow colSpan={4} />
                  ) : (
                    financialData.bonuses.map((bonus) => (
                      <tr key={bonus.id} className={rowClass}>
                        <td className="px-4 py-3 text-text-secondary">
                          {formatDate(bonus.bonus_date)}
                        </td>
                        <td className="px-4 py-3 text-text-primary">
                          {bonus.profile?.name || 'Desconhecido'}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-text-primary">{bonus.title}</p>
                          <p className="text-xs text-text-secondary">{bonus.description || '-'}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-medium state-success tabular-nums">
                          {formatCurrency(bonus.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
