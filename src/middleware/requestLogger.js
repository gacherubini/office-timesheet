import { randomUUID } from 'node:crypto'
import { logger as defaultLogger, requestContext } from '../lib/logger.js'

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
// req.path ignora a query string: /health?x=1 continua sendo o health check.
function levelForRequest(req, status) {
  if (req.path === '/health') return 'debug'
  return levelFor(status)
}

// Resposta de streaming (hoje só o SSE de /notifications/stream). A conexão fica
// aberta de propósito por minutos ou horas, então o tempo até o `close` não é
// tempo de resposta e não pode entrar na estatística de latência.
export function isStreaming(res) {
  const contentType = res.getHeader?.('content-type') ?? res._contentTypeBruto
  return String(contentType ?? '').includes('text/event-stream')
}

const arredonda = (ms) => Math.round(ms * 100) / 100

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

    // res.writeHead(status, headers) — o que o SSE usa — grava direto na string
    // de headers já serializada e não aparece em res.getHeader(). Guardamos o
    // content-type de passagem só pra conseguir identificar o streaming depois.
    const writeHeadOriginal = res.writeHead.bind(res)
    res.writeHead = (...args) => {
      const headers = args[args.length - 1]
      if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
        for (const [nome, valor] of Object.entries(headers)) {
          if (nome.toLowerCase() === 'content-type') res._contentTypeBruto = String(valor)
        }
      }
      return writeHeadOriginal(...args)
    }

    let logged = false
    const emit = () => {
      if (logged) return
      logged = true

      const duracao = arredonda(Number(process.hrtime.bigint() - start) / 1e6)
      const status = res.statusCode

      const linha = {
        req_id: req.req_id,
        method: req.method,
        route: routeOf(req),
        status,
        user_id: req.profile?.id,
        ip: req.ip,
        erro_msg: req._erroMsg,
      }

      // Streaming vira um evento próprio: sem `duracao_ms`, com a duração da
      // conexão em `duracao_conexao_ms`. A conexão continua observável (dá pra
      // contar, medir e cruzar por req_id), mas fica fora do p50/p95/p99 —
      // senão uma aba aberta a tarde toda dominaria o percentil da API inteira.
      if (isStreaming(res)) {
        logger.info({ ...linha, evento: 'stream_encerrado', duracao_conexao_ms: duracao })
        return
      }

      logger[levelForRequest(req, status)]({ ...linha, duracao_ms: duracao })
    }

    // 'finish' = resposta enviada com sucesso. 'close' cobre conexão abortada
    // pelo cliente antes do fim (senão o request sumiria do log).
    res.on('finish', emit)
    res.on('close', emit)

    // Todo o resto da cadeia roda dentro do contexto do request. É isso que faz
    // o req_id aparecer sozinho nos logs de erro das rotas, sem passar req pra
    // ninguém (ver mixin em lib/logger.js).
    requestContext.run({ req_id: req.req_id }, next)
  }
}

export const requestLogger = makeRequestLogger(defaultLogger)
