import { describe, it, expect, beforeEach } from 'vitest'
import http from 'node:http'
import { resetDb } from '../helpers/db.js'
import { asUser, request, tokenFor } from '../helpers/api.js'
import { makeUser } from '../helpers/factories.js'
import { app } from '../../app.js'
import { testSink, clearTestSink } from '../../lib/logger.js'

// Pega a última linha que tem duracao_ms (a linha de request).
const lastRequestLog = () => [...testSink].reverse().find((l) => l.duracao_ms !== undefined)

// JWT sintético, no formato real (header.payload.assinatura). Não precisa ser
// válido: o que se testa é que a string nunca chega em nenhum log.
const JWT_FALSO =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjQyLCJyb2xlIjoiYWRtaW4ifQ.assinatura_falsa_de_teste'

// O log da conexão SSE só sai quando o servidor percebe o fim da conexão, que é
// assíncrono. Espera a condição em vez de chutar um sleep.
async function esperarAte(condicao, timeoutMs = 5000) {
  const limite = Date.now() + timeoutMs
  while (!condicao()) {
    if (Date.now() > limite) throw new Error('timeout esperando a linha de log')
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('log de request', () => {
  let user

  beforeEach(async () => {
    await resetDb()
    user = await makeUser()
    clearTestSink()
  })

  it('request autenticado gera linha com todos os campos', async () => {
    await asUser(user).get('/me/stats')
    const log = lastRequestLog()

    expect(log).toBeDefined()
    expect(log.method).toBe('GET')
    expect(log.status).toBe(200)
    expect(typeof log.duracao_ms).toBe('number')
    expect(log.duracao_ms).toBeGreaterThanOrEqual(0)
    expect(log.user_id).toBe(user.id)
    expect(typeof log.req_id).toBe('string')
    expect(log.level).toBe(30) // info
  })

  it('route guarda o padrão da rota, não a URL concreta', async () => {
    await asUser(user).get(`/projects/999999/my-hours`)
    const log = lastRequestLog()

    expect(log.route).toContain(':id')
    expect(log.route).not.toContain('999999')
  })

  it('request sem token gera linha em nível warn e sem user_id', async () => {
    await request.get('/me/stats')
    const log = lastRequestLog()

    expect(log.status).toBe(401)
    expect(log.level).toBe(40) // warn
    expect(log.user_id).toBeUndefined()
  })

  it('/health não gera linha em nível info', async () => {
    await request.get('/health')
    const log = lastRequestLog()

    expect(log.level).toBe(20) // debug
  })

  it('/health com query string continua fora do nível info', async () => {
    await request.get('/health?x=1')
    const log = lastRequestLog()

    expect(log.level).toBe(20) // debug
  })

  // Critério 4 do spec: nenhum log com token em texto puro. O token chega de dois
  // jeitos — header Authorization (maioria das rotas) e query string
  // (?token=..., usado pelo SSE, que não consegue mandar header). O caso da
  // query é o que realmente pode vazar: a censura do pino é por caminho de
  // propriedade e não enxerga dentro de uma string de URL.
  it('token no header Authorization não aparece em texto puro', async () => {
    await asUser(user).get('/me/stats')
    const bruto = JSON.stringify(testSink)

    expect(bruto).not.toContain('Bearer ')
    expect(bruto).not.toMatch(/eyJ[A-Za-z0-9_-]+\./) // formato de JWT
  })

  it('token na query string não aparece em nenhum log (caminho normal)', async () => {
    await request.get(`/notifications/stream?token=${JWT_FALSO}`) // 401, token inválido
    const bruto = JSON.stringify(testSink)

    expect(bruto).not.toContain(JWT_FALSO)
    expect(bruto).not.toMatch(/eyJ[A-Za-z0-9_-]+\./)
  })

  it('token na query string não aparece em nenhum log (caminho de erro)', async () => {
    // JSON malformado → express.json lança → errorHandler central.
    await request
      .post(`/auth/login?token=${JWT_FALSO}`)
      .set('Content-Type', 'application/json')
      .send('{ isso não é json')

    const bruto = JSON.stringify(testSink)

    expect(bruto).not.toContain(JWT_FALSO)
    expect(bruto).not.toMatch(/eyJ[A-Za-z0-9_-]+\./)
  })

  // Objetivo 3 do spec: o req_id amarra todas as linhas de um mesmo request.
  // Os ~48 logs de erro das rotas não recebem req — o req_id chega neles pelo
  // AsyncLocalStorage + mixin do pino.
  it('erro logado dentro da rota carrega o req_id do próprio request', async () => {
    // id não numérico → o Postgres reclama → cai no catch da rota, que loga.
    const res = await asUser(user).get('/projects/abc/my-hours')
    expect(res.status).toBe(400)

    const linhaRequest = lastRequestLog()
    const erroDaRota = testSink.find((l) => l.level === 50 && l.duracao_ms === undefined)

    expect(erroDaRota).toBeDefined()
    expect(erroDaRota.msg).toBe('Erro em GET /projects/:id/my-hours')
    expect(erroDaRota.req_id).toBe(linhaRequest.req_id)
    expect(linhaRequest.req_id).toBeTruthy()
  })

  it('a resposta traz o header x-request-id', async () => {
    const res = await asUser(user).get('/me/stats')
    expect(res.headers['x-request-id']).toBeTruthy()
  })

  it('4xx registra a mensagem devolvida em erro_msg', async () => {
    await request.get('/me/stats') // 401 { error: 'Token ausente.' }
    const log = lastRequestLog()

    expect(log.erro_msg).toBe('Token ausente.')
  })

  it('2xx não tem erro_msg', async () => {
    await asUser(user).get('/me/stats')
    const log = lastRequestLog()

    expect(log.erro_msg).toBeUndefined()
  })
})

// A conexão SSE fica aberta de propósito (heartbeat de 25s). O tempo até ela
// fechar é tempo de conexão, não tempo de resposta — se entrasse como duracao_ms
// dominaria o p95/p99 de toda a API.
describe('SSE fora da estatística de latência', () => {
  let user

  beforeEach(async () => {
    await resetDb()
    user = await makeUser()
    clearTestSink()
  })

  it('conexão SSE encerrada gera evento próprio, sem duracao_ms', async () => {
    const token = tokenFor(user)
    const server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s))
    })

    try {
      const { port } = server.address()
      await new Promise((resolve, reject) => {
        const req = http.get(
          `http://127.0.0.1:${port}/notifications/stream?token=${token}`,
          (res) => {
            expect(res.statusCode).toBe(200)
            res.once('data', () => {
              req.destroy()
              resolve()
            })
          },
        )
        req.on('error', reject)
      })

      await esperarAte(() => testSink.some((l) => l.evento === 'stream_encerrado'))
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }

    const linha = testSink.find((l) => l.evento === 'stream_encerrado')
    expect(linha.route).toBe('/notifications/stream')
    expect(linha.status).toBe(200)
    expect(typeof linha.req_id).toBe('string')
    expect(typeof linha.duracao_conexao_ms).toBe('number')

    // O que importa: nada dessa conexão entra no cálculo de latência.
    expect(linha.duracao_ms).toBeUndefined()
    expect(testSink.filter((l) => l.duracao_ms !== undefined)).toHaveLength(0)

    // E o token que veio na query também não vaza por esse caminho.
    expect(JSON.stringify(testSink)).not.toContain(token)
  })
})

describe('404 e erro não tratado', () => {
  beforeEach(() => clearTestSink())

  it('rota inexistente devolve 404 em JSON', async () => {
    const res = await request.get('/rota-que-nao-existe')

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Rota não encontrada.')
  })

  it('rota inexistente é logada como unmatched', async () => {
    await request.get('/rota-que-nao-existe')
    const log = lastRequestLog()

    expect(log.route).toBe('unmatched')
    expect(log.status).toBe(404)
  })

  it('JSON malformado devolve 500 com req_id no corpo', async () => {
    const res = await request
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ isso não é json')

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Erro interno.')
    expect(typeof res.body.req_id).toBe('string')
  })

  it('erro não tratado gera log de nível error com stack', async () => {
    await request
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ isso não é json')

    const erro = testSink.find((l) => l.level === 50)
    expect(erro).toBeDefined()
    expect(erro.err.stack).toBeTruthy()
  })
})
