// Saldo de créditos ao vivo da API oficial da DeepSeek (GET /user/balance).
// Server-side: a AGENT_API_KEY nunca vai pro browser. Qualquer falha (sem chave,
// provedor sem o endpoint, rede/timeout) vira BalanceIndisponivel — a rota trata
// como "saldo indisponível", nunca 500. Só a DeepSeek oficial expõe isso.
const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const TIMEOUT_MS = Number(process.env.AGENT_BALANCE_TIMEOUT_MS) || 5000

export class BalanceIndisponivel extends Error {}

export async function getBalance() {
  const key = process.env.AGENT_API_KEY
  if (!key) throw new BalanceIndisponivel('AGENT_API_KEY ausente')
  const base = process.env.AGENT_PROVIDER_BASE_URL || DEFAULT_BASE_URL

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const resp = await fetch(`${base}/user/balance`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: ctrl.signal,
    })
    if (!resp.ok) throw new BalanceIndisponivel(`status ${resp.status}`)
    const json = await resp.json()
    const info = json?.balance_infos?.[0]
    if (!info) throw new BalanceIndisponivel('resposta sem balance_infos')
    return {
      disponivel: Boolean(json.is_available),
      moeda: info.currency,
      total: Number(info.total_balance),
      concedido: Number(info.granted_balance),
      recarga: Number(info.topped_up_balance),
    }
  } catch (err) {
    if (err instanceof BalanceIndisponivel) throw err
    throw new BalanceIndisponivel(err.message)
  } finally {
    clearTimeout(timer)
  }
}
