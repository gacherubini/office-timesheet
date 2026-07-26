import { randomUUID } from 'node:crypto'
import { logger as defaultLogger } from '../lib/logger.js'

// Padrão da rota (/projects/:id), não a URL concreta (/projects/318). Guardar a
// URL crua faria cada projeto virar uma série distinta e impediria agregar por
// rota — que é justamente o que permite achar a rota lenta.
export function routeOf(req) {
  if (!req.route?.path) return 'unmatched'
  return `${req.baseUrl || ''}${req.route.path}`
}

export function levelFor(status) {
  if (status >= 500) return 'error'
  if (status >= 400) return 'warn'
  return 'info'
}

// O Fly bate no /health o tempo todo. Em nível debug ele não sobe pro log
// center em produção (LOG_LEVEL=info), mas continua visível em dev.
function levelForRequest(req, status) {
  if (req.originalUrl === '/health') return 'debug'
  return levelFor(status)
}

export function makeRequestLogger(logger) {
  return function requestLogger(req, res, next) {
    const start = process.hrtime.bigint()

    req.req_id = randomUUID()
    res.setHeader('x-request-id', req.req_id)

    // A mensagem de erro só existe no corpo da resposta. Guardamos apenas o
    // campo `error` (nunca o corpo inteiro, pra não vazar dado de negócio) e
    // devolvemos exatamente o que res.json devolveria — nenhuma resposta muda.
    const jsonOriginal = res.json.bind(res)
    res.json = (body) => {
      if (res.statusCode >= 400 && typeof body?.error === 'string') {
        req._erroMsg = body.error.slice(0, 200)
      }
      return jsonOriginal(body)
    }

    let logged = false
    const emit = () => {
      if (logged) return
      logged = true

      const duracao_ms = Number(process.hrtime.bigint() - start) / 1e6
      const status = res.statusCode

      logger[levelForRequest(req, status)]({
        req_id: req.req_id,
        method: req.method,
        route: routeOf(req),
        status,
        duracao_ms: Math.round(duracao_ms * 100) / 100,
        user_id: req.profile?.id,
        ip: req.ip,
        erro_msg: req._erroMsg,
      })
    }

    // 'finish' = resposta enviada com sucesso. 'close' cobre conexão abortada
    // pelo cliente antes do fim (senão o request sumiria do log).
    res.on('finish', emit)
    res.on('close', emit)

    next()
  }
}

export const requestLogger = makeRequestLogger(defaultLogger)
