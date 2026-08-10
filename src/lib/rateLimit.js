// Rate limit simples em memória (ok com min_machines=1). Chave = IP + rota.

const buckets = new Map()

/**
 * @param {{ windowMs?: number, max?: number, key?: (req) => string }} opts
 */
export function rateLimit({ windowMs = 15 * 60 * 1000, max = 20, key } = {}) {
  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now()
    const id = key ? key(req) : `${req.ip || 'unknown'}:${req.path}`
    let bucket = buckets.get(id)

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(id, bucket)
    }

    bucket.count += 1
    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
      res.setHeader('Retry-After', String(retryAfter))
      return res.status(429).json({ error: 'Muitas tentativas. Tente novamente mais tarde.' })
    }

    return next()
  }
}

// Expõe limpeza pra testes.
export function _resetRateLimitBuckets() {
  buckets.clear()
}
