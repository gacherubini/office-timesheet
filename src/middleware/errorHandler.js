import { logger as defaultLogger } from '../lib/logger.js'

export function notFound(req, res) {
  return res.status(404).json({ error: 'Rota não encontrada.' })
}

// Último middleware da cadeia. Captura o que escapa das rotas: throw fora de
// try, erro do Multer, JSON malformado do express.json(). O req_id vai no corpo
// pro usuário poder reportar o código e você achar o log exato.
export function makeErrorHandler(logger) {
  return function errorHandler(err, req, res, _next) {
    logger.error({
      req_id: req.req_id,
      method: req.method,
      url: req.originalUrl,
      status_original: err.status || err.statusCode,
      user_id: req.profile?.id,
      err: { type: err.name, message: err.message, stack: err.stack },
    })

    if (res.headersSent) return

    // Sempre 500: chegar aqui significa que ninguém tratou o erro. As rotas que
    // sabem responder outro status já respondem sozinhas (os ~130 catch). O
    // status original do erro fica registrado no log como `status_original`.
    return res.status(500).json({
      error: 'Erro interno.',
      req_id: req.req_id,
    })
  }
}

export const errorHandler = makeErrorHandler(defaultLogger)

// Um erro fora do ciclo de request hoje derruba a API em silêncio. Aqui ele ao
// menos deixa rastro antes de morrer.
export function installProcessHandlers(logger) {
  process.on('uncaughtException', (err) => {
    logger.error({ err: { type: err.name, message: err.message, stack: err.stack } },
      'uncaughtException — encerrando')
    process.exit(1)
  })

  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason))
    logger.error({ err: { type: err.name, message: err.message, stack: err.stack } },
      'unhandledRejection')
  })
}
