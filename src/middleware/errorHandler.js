import { logger as defaultLogger } from '../lib/logger.js'

export function notFound(req, res) {
  return res.status(404).json({ error: 'Rota não encontrada.' })
}

// Só o caminho, sem a query string. A censura do pino é por caminho de
// propriedade e não enxerga dentro de uma string: logar a URL inteira mandaria
// o `?token=...` do SSE em texto puro pro stdout e pro Axiom.
export function caminhoDe(originalUrl) {
  return String(originalUrl ?? '').split('?')[0]
}

// Último middleware da cadeia. Captura o que escapa das rotas: throw fora de
// try, erro do Multer, JSON malformado do express.json(). O req_id vai no corpo
// pro usuário poder reportar o código e você achar o log exato.
export function makeErrorHandler(logger) {
  return function errorHandler(err, req, res, _next) {
    logger.error({
      req_id: req.req_id,
      method: req.method,
      url: caminhoDe(req.originalUrl),
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

// Erro fora do ciclo de request. Os dois handlers deixam rastro e encerram o
// processo: o Node já derruba a API nos dois casos por padrão, e seguir
// atendendo a partir de um estado que ele considerou irrecuperável é pior que
// reiniciar. No Fly a máquina volta sozinha (min_machines_running = 1).
// `exit` e `target` são injetáveis só pra dar pra testar sem matar o runner.
export function installProcessHandlers(logger, { exit = (code) => process.exit(code), target = process } = {}) {
  target.on('uncaughtException', (err) => {
    logger.error({ err: { type: err.name, message: err.message, stack: err.stack } },
      'uncaughtException — encerrando')
    exit(1)
  })

  target.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason))
    logger.error({ err: { type: err.name, message: err.message, stack: err.stack } },
      'unhandledRejection — encerrando')
    exit(1)
  })
}
