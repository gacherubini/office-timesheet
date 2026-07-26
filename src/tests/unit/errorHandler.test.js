import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import { caminhoDe, makeErrorHandler, installProcessHandlers } from '../../middleware/errorHandler.js'

function fakeLogger() {
  const linhas = []
  return { linhas, error: (obj, msg) => linhas.push({ ...obj, msg }) }
}

describe('caminhoDe — URL sem query string', () => {
  it('remove a query inteira', () => {
    expect(caminhoDe('/notifications/stream?token=eyJabc.def.ghi')).toBe('/notifications/stream')
  })

  it('URL sem query fica igual', () => {
    expect(caminhoDe('/projects/318')).toBe('/projects/318')
  })

  it('undefined vira string vazia', () => {
    expect(caminhoDe(undefined)).toBe('')
  })
})

describe('errorHandler — o que vai pro log', () => {
  const req = {
    req_id: 'req-1',
    method: 'POST',
    originalUrl: '/auth/login?token=eyJhbGciOi.payload.assinatura',
    profile: { id: 7 },
  }

  function fakeRes() {
    const res = { headersSent: false, statusCode: null, body: null }
    res.status = (s) => { res.statusCode = s; return res }
    res.json = (b) => { res.body = b; return res }
    return res
  }

  it('loga o caminho sem o token da query', () => {
    const logger = fakeLogger()
    makeErrorHandler(logger)(new Error('boom'), req, fakeRes(), () => {})

    expect(logger.linhas[0].url).toBe('/auth/login')
    expect(JSON.stringify(logger.linhas)).not.toContain('eyJ')
  })

  it('responde 500 com req_id e registra status_original', () => {
    const logger = fakeLogger()
    const err = Object.assign(new Error('json ruim'), { status: 400 })
    const res = fakeRes()
    makeErrorHandler(logger)(err, req, res, () => {})

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Erro interno.', req_id: 'req-1' })
    expect(logger.linhas[0].status_original).toBe(400)
    expect(logger.linhas[0].user_id).toBe(7)
  })
})

describe('installProcessHandlers — deixa rastro e encerra', () => {
  function instala() {
    const logger = fakeLogger()
    const target = new EventEmitter()
    const saidas = []
    installProcessHandlers(logger, { exit: (c) => saidas.push(c), target })
    return { logger, target, saidas }
  }

  it('uncaughtException loga com stack e encerra com 1', () => {
    const { logger, target, saidas } = instala()
    target.emit('uncaughtException', new Error('explodiu'))

    expect(logger.linhas[0].err.message).toBe('explodiu')
    expect(logger.linhas[0].err.stack).toBeTruthy()
    expect(saidas).toEqual([1])
  })

  // Important 5: sem process.exit o listener anula o comportamento padrão do
  // Node e a API segue servindo de um estado que o próprio Node considerou
  // irrecuperável.
  it('unhandledRejection loga e encerra com 1', () => {
    const { logger, target, saidas } = instala()
    target.emit('unhandledRejection', new Error('promise solta'))

    expect(logger.linhas[0].msg).toBe('unhandledRejection — encerrando')
    expect(logger.linhas[0].err.message).toBe('promise solta')
    expect(saidas).toEqual([1])
  })

  it('rejection com valor que não é Error também encerra', () => {
    const { logger, target, saidas } = instala()
    target.emit('unhandledRejection', 'string solta')

    expect(logger.linhas[0].err.message).toBe('string solta')
    expect(saidas).toEqual([1])
  })
})
