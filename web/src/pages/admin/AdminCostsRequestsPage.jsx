import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { Wallet, Inbox } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { MetricCard } from '../../components/ui/MetricCard'
import { Tabs } from '../../components/ui/Tabs'

const STATUS = ['novo', 'triado', 'feito', 'descartado']

function money(v, moeda) {
  if (v === null || v === undefined) return '—'
  return `${moeda === 'USD' ? 'US$' : moeda === 'CNY' ? '¥' : ''} ${Number(v).toFixed(2)}`
}

export function AdminCostsRequestsPage() {
  const [tab, setTab] = useState('custos')
  const [costs, setCosts] = useState(null)
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([api.get('/admin/agent/costs'), api.get('/admin/agent/feature-requests')])
      .then(([c, p]) => { setCosts(c); setPedidos(p) })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  async function mudarStatus(id, status) {
    const atualizado = await api.patch(`/admin/agent/feature-requests/${id}`, { status })
    setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, status: atualizado.status } : p)))
  }

  const maxDia = costs?.gasto?.porDia?.reduce((m, d) => Math.max(m, d.custoUsd || 0), 0) || 0

  return (
    <div className="space-y-6">
      <PageHeader title="Custos & Pedidos" subtitle="Gasto estimado do assistente (DeepSeek) e pedidos que o agente ainda não atende." />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'custos', label: 'Custos' }, { value: 'pedidos', label: 'Pedidos' }]} />

      {loading && <Card>Carregando…</Card>}
      {error && <Card className="state-danger-soft">{error}</Card>}

      {!loading && !error && tab === 'custos' && costs && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard label="Saldo total" icon={Wallet}
              value={costs.saldoIndisponivel ? '—' : money(costs.saldo?.total, costs.saldo?.moeda)}
              sublabel={costs.saldoIndisponivel ? 'saldo indisponível neste provedor' : `concedido ${money(costs.saldo?.concedido, costs.saldo?.moeda)} · recarga ${money(costs.saldo?.recarga, costs.saldo?.moeda)}`} />
            <MetricCard label="Gasto do mês" icon={Wallet}
              value={costs.gasto.precosConfigurados ? money(costs.gasto.totalUsd, 'USD') : '—'}
              sublabel={costs.gasto.precosConfigurados && costs.gasto.precos
                ? `USD / 1M tok · in ${costs.gasto.precos.in} · out ${costs.gasto.precos.out} · cache ${costs.gasto.precos.cached}`
                : 'configure AGENT_PRICE_* para ver em dinheiro'} />
            <MetricCard label="Dias com uso" icon={Inbox} value={costs.gasto.porDia.length} sublabel="no mês corrente" />
          </div>

          <Card>
            <h3 className="text-sm font-medium mb-3">Gasto por dia (mês corrente)</h3>
            {costs.gasto.porDia.length === 0 && <p className="text-text-secondary text-sm">Sem uso registrado neste mês.</p>}
            <div className="space-y-1">
              {costs.gasto.porDia.map((d) => (
                <div key={d.dia} className="flex items-center gap-3 text-sm">
                  <span className="w-24 tabular-nums text-text-secondary">{d.dia}</span>
                  <div className="flex-1 bg-surface-alt rounded h-3 overflow-hidden">
                    <div className="h-full bg-accent" style={{ width: maxDia ? `${((d.custoUsd || 0) / maxDia) * 100}%` : '0%' }} />
                  </div>
                  <span className="w-36 text-right tabular-nums">
                    {costs.gasto.precosConfigurados ? money(d.custoUsd, 'USD') : '—'}
                    <span className="ml-2 text-text-secondary">{(d.tokensIn + d.tokensOut).toLocaleString('pt-BR')} tok</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-text-secondary mt-3">
              O gasto é estimado pelos preços do Fly (`AGENT_PRICE_*`, off-peak DeepSeek V4 Flash).
              Linhas gravadas antes dos preços terem `custo` nulo e não entram na soma em USD.
              O saldo, quando o provedor expõe, é a fatura dele — pode não bater ao centavo.
            </p>
          </Card>
        </div>
      )}

      {!loading && !error && tab === 'pedidos' && (
        <Card padded={false}>
          {pedidos.length === 0 ? (
            <p className="p-5 text-text-secondary text-sm">Nenhum pedido não atendido registrado ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-secondary border-b border-border-subtle">
                  <th className="p-3">Pedido</th><th className="p-3">Quem</th><th className="p-3">Quando</th><th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id} className="border-b border-border-subtle align-top">
                    <td className="p-3">
                      <div className="font-medium">{p.descricao}</div>
                      {p.texto_original && <div className="text-text-secondary text-xs mt-1">“{p.texto_original}”</div>}
                    </td>
                    <td className="p-3">{p.user_name || '—'}</td>
                    <td className="p-3 tabular-nums text-text-secondary">{new Date(p.created_at).toLocaleDateString('pt-BR')}</td>
                    <td className="p-3">
                      <select value={p.status} onChange={(e) => mudarStatus(p.id, e.target.value)} className="border border-border-subtle rounded px-2 py-1 bg-surface">
                        {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  )
}
