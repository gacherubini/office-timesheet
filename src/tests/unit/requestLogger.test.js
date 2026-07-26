import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import { routeOf, levelFor, isStreaming, makeRequestLogger } from '../../middleware/requestLogger.js'

// req/res mínimos: dá pra exercitar o middleware inteiro sem subir servidor.
function fakeReq({ path = '/projects', metodo = 'GET' } = {}) {
  return {
    method: metodo,
    path,
    originalUrl: path,
    baseUrl: '',
    route: { path },
    ip: '::1',
  }
}

function fakeRes({ contentType, status = 200 } = {}) {
  const res = new EventEmitter()
  res.statusCode = status
  res.setHeader = () => {}
  res.getHeader = (nome) => (nome === 'content-type' ? contentType : undefined)
  res.json = (body) => body
  res.writeHead = () => res
  return res
}

function fakeLogger() {
  const linhas = []
  const registra = (nivel) => (obj) => linhas.push({ nivel, ...obj })
  return {
    linhas,
    debug: registra('debug'),
    info: registra('info'),
    warn: registra('warn'),
    error: registra('error'),
  }
}

describe('routeOf — padrão da rota, nunca a URL concreta', () => {
  it('rota simples na raiz', () => {
    expect(routeOf({ baseUrl: '', route: { path: '/projects' } })).toBe('/projects')
  })

  it('rota com parâmetro mantém o :id', () => {
    expect(routeOf({ baseUrl: '', route: { path: '/projects/:id/tasks' } }))
      .toBe('/projects/:id/tasks')
  })

  it('router montado com prefixo concatena o baseUrl', () => {
    expect(routeOf({ baseUrl: '/admin', route: { path: '/users/:id' } }))
      .toBe('/admin/users/:id')
  })

  it('request sem rota casada vira "unmatched"', () => {
    expect(routeOf({ baseUrl: '', route: undefined })).toBe('unmatched')
  })
})

describe('levelFor — nível derivado do status', () => {
  it('200 → info', () => expect(levelFor(200)).toBe('info'))
  it('201 → info', () => expect(levelFor(201)).toBe('info'))
  it('304 → info', () => expect(levelFor(304)).toBe('info'))
  it('400 → warn', () => expect(levelFor(400)).toBe('warn'))
  it('404 → warn', () => expect(levelFor(404)).toBe('warn'))
  it('499 → warn', () => expect(levelFor(499)).toBe('warn'))
  it('500 → error', () => expect(levelFor(500)).toBe('error'))
  it('503 → error', () => expect(levelFor(503)).toBe('error'))
})

describe('isStreaming — reconhece resposta de streaming', () => {
  it('content-type de SSE é streaming', () => {
    expect(isStreaming(fakeRes({ contentType: 'text/event-stream' }))).toBe(true)
  })

  it('JSON não é streaming', () => {
    expect(isStreaming(fakeRes({ contentType: 'application/json; charset=utf-8' }))).toBe(false)
  })

  it('resposta sem content-type não é streaming', () => {
    expect(isStreaming(fakeRes())).toBe(false)
  })
})

describe('linha de request', () => {
  it('request normal loga duracao_ms', () => {
    const logger = fakeLogger()
    const res = fakeRes({ contentType: 'application/json' })
    makeRequestLogger(logger)(fakeReq(), res, () => {})
    res.emit('finish')

    expect(logger.linhas).toHaveLength(1)
    const [linha] = logger.linhas
    expect(linha.nivel).toBe('info')
    expect(typeof linha.duracao_ms).toBe('number')
    expect(linha.evento).toBeUndefined()
  })

  it('/health com query string continua em debug', () => {
    const logger = fakeLogger()
    const req = fakeReq({ path: '/health' })
    req.originalUrl = '/health?x=1'
    const res = fakeRes()
    makeRequestLogger(logger)(req, res, () => {})
    res.emit('finish')

    expect(logger.linhas[0].nivel).toBe('debug')
  })

  // Critical 2: a conexão SSE fica aberta de propósito. Se a duração dela
  // entrasse como duracao_ms, o p95/p99 da API inteira viraria ficção.
  it('resposta de streaming não entra na estatística de latência', () => {
    const logger = fakeLogger()
    const res = fakeRes({ contentType: 'text/event-stream' })
    makeRequestLogger(logger)(fakeReq({ path: '/notifications/stream' }), res, () => {})
    res.emit('close')

    expect(logger.linhas).toHaveLength(1)
    const [linha] = logger.linhas
    expect(linha.duracao_ms).toBeUndefined()
    expect(linha.evento).toBe('stream_encerrado')
    expect(typeof linha.duracao_conexao_ms).toBe('number')
    // continua observável: dá pra achar e correlacionar
    expect(typeof linha.req_id).toBe('string')
    expect(linha.route).toBe('/notifications/stream')
    expect(linha.status).toBe(200)
  })

  it('content-type definido via writeHead também é reconhecido como streaming', () => {
    const logger = fakeLogger()
    // getHeader não enxerga o que o writeHead(status, headers) grava — é
    // exatamente o caso do SSE real.
    const res = fakeRes()
    makeRequestLogger(logger)(fakeReq({ path: '/notifications/stream' }), res, () => {})
    expect(res.writeHead(200, { 'Content-Type': 'text/event-stream' })).toBe(res)
    res.emit('close')

    expect(logger.linhas[0].evento).toBe('stream_encerrado')
    expect(logger.linhas[0].duracao_ms).toBeUndefined()
  })

  it('só loga uma vez, mesmo com finish e close', () => {
    const logger = fakeLogger()
    const res = fakeRes({ contentType: 'application/json' })
    makeRequestLogger(logger)(fakeReq(), res, () => {})
    res.emit('finish')
    res.emit('close')

    expect(logger.linhas).toHaveLength(1)
  })
})
