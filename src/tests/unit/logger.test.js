import { describe, it, expect, beforeEach } from 'vitest'
import { logger, testSink, clearTestSink, requestContext } from '../../lib/logger.js'

describe('logger — censura de dados sensíveis', () => {
  beforeEach(() => clearTestSink())

  it('censura o header authorization', () => {
    logger.info({ headers: { authorization: 'Bearer abc.def.ghi' } })
    expect(testSink[0].headers.authorization).toBe('[Redacted]')
  })

  it('censura o header cookie', () => {
    logger.info({ headers: { cookie: 'session=segredo' } })
    expect(testSink[0].headers.cookie).toBe('[Redacted]')
  })

  it('censura password e senha em qualquer corpo', () => {
    logger.info({ body: { password: 'p4ssw0rd', senha: 'segredo', email: 'a@b.com' } })
    expect(testSink[0].body.password).toBe('[Redacted]')
    expect(testSink[0].body.senha).toBe('[Redacted]')
    expect(testSink[0].body.email).toBe('a@b.com')
  })

  it('censura token e newPassword', () => {
    logger.info({ body: { token: 'tok', newPassword: 'nova' } })
    expect(testSink[0].body.token).toBe('[Redacted]')
    expect(testSink[0].body.newPassword).toBe('[Redacted]')
  })

  it('em teste escreve no sink e não no stdout', () => {
    logger.info({ msg: 'oi' })
    expect(testSink).toHaveLength(1)
    expect(testSink[0].msg).toBe('oi')
  })

  it('clearTestSink esvazia o sink', () => {
    logger.info({ msg: 'a' })
    clearTestSink()
    expect(testSink).toHaveLength(0)
  })
})

describe('logger — req_id vindo do contexto do request', () => {
  beforeEach(() => clearTestSink())

  it('fora de um request não existe req_id', () => {
    logger.info({ msg: 'API subindo' })
    expect(testSink[0].req_id).toBeUndefined()
  })

  it('dentro do contexto o req_id entra sozinho, sem passar nada na chamada', () => {
    requestContext.run({ req_id: 'req-123' }, () => {
      logger.error({ err: { message: 'boom' } }, 'Erro em GET /projects')
    })

    expect(testSink[0].req_id).toBe('req-123')
    expect(testSink[0].msg).toBe('Erro em GET /projects')
  })

  it('req_id explícito na chamada vence o do contexto (uma chave só)', () => {
    requestContext.run({ req_id: 'do-contexto' }, () => {
      logger.info({ req_id: 'explicito' })
    })

    expect(testSink[0].req_id).toBe('explicito')
  })

  it('o contexto sobrevive ao await dentro do request', async () => {
    await requestContext.run({ req_id: 'req-async' }, async () => {
      await new Promise((r) => setTimeout(r, 5))
      logger.info({ msg: 'depois do await' })
    })

    expect(testSink[0].req_id).toBe('req-async')
  })
})
