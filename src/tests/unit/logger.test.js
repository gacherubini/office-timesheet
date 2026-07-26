import { describe, it, expect, beforeEach } from 'vitest'
import { logger, testSink, clearTestSink } from '../../lib/logger.js'

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
