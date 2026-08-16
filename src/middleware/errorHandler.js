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

    // express.json() estoura com status 413 (entity.too.large). Não é bug da
    // rota — é recusa de payload. Devolver 500 mentiria "erro interno".
    if (err.status === 413 || err.statusCode === 413 || err.type === 'entity.too.large') {
      return res.status(413).json({
        error: 'Corpo da requisição grande demais.',
        req_id: req.req_id,
      })
    }

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

// Teto de espera pelo flush. Curto de propósito: a máquina está caindo de
// qualquer jeito, e segurar o processo não traz o log de volta.
const FLUSH_TIMEOUT_MS = 500

// Em produção o destino do pino é uma worker thread. Um `exit` imediato mata o
// processo antes de ela esvaziar o buffer, e a linha do crash — justamente a
// que explica a queda — não chega nem ao `fly logs` nem ao Axiom. O flush
// espera o buffer sair; o timer garante que um transporte travado não impeça o
// encerramento. Quem chegar primeiro encerra; o outro vira no-op.
export function encerraDepoisDoFlush(logger, exit, timeoutMs = FLUSH_TIMEOUT_MS) {
  let encerrou = false
  const encerra = () => {
    if (encerrou) return
    encerrou = true
    clearTimeout(timer)
    exit(1)
  }

  const timer = setTimeout(encerra, timeoutMs)
  if (typeof logger.flush === 'function') logger.flush(encerra)
  else encerra()
}

// Erro fora do ciclo de request. Os dois handlers deixam rastro e encerram o
// processo: o Node já derruba a API nos dois casos por padrão, e seguir
// atendendo a partir de um estado que ele considerou irrecuperável é pior que
// reiniciar. No Fly a máquina volta sozinha (min_machines_running = 1).
// `exit` e `target` são injetáveis só pra dar pra testar sem matar o runner.
export function installProcessHandlers(logger, { exit = (code) => process.exit(code), target = process } = {}) {
  target.on('uncaughtException', (err) => {
    logger.error({ err: { type: err.name, message: err.message, stack: err.stack } },
      'uncaughtException — encerrando')
    encerraDepoisDoFlush(logger, exit)
  })

  target.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason))
    logger.error({ err: { type: err.name, message: err.message, stack: err.stack } },
      'unhandledRejection — encerrando')
    encerraDepoisDoFlush(logger, exit)
  })
}
