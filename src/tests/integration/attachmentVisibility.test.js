import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin } from '../helpers/factories.js'

describe('visibilidade de anexo', () => {
  let admin, emp, cliente, aberto, restrito
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    emp = await makeUser({ role: 'employee' })
    const res = await asUser(admin).post('/admin/clients').send({ name: 'Fulano' })
    cliente = res.body.id
    const { rows } = await query(
      `INSERT INTO client_attachments (client_id, file_url, file_name, is_restricted)
       VALUES ($1,'http://x/a.pdf','briefing.pdf',false),
              ($1,'http://x/b.pdf','contrato.pdf',true)
       RETURNING id, file_name`, [cliente])
    aberto = rows.find((r) => r.file_name === 'briefing.pdf').id
    restrito = rows.find((r) => r.file_name === 'contrato.pdf').id
  })

  it('admin vê os dois anexos', async () => {
    const res = await asUser(admin).get(`/admin/clients/${cliente}/attachments`)
    expect(res.body).toHaveLength(2)
  })

  it('colaborador vê só o aberto', async () => {
    const res = await asUser(emp).get(`/admin/clients/${cliente}/attachments`)
    expect(res.body.map((a) => a.file_name)).toEqual(['briefing.pdf'])
  })

  // Esconder da lista não basta: o id é adivinhável por quem já viu antes de a
  // restrição entrar, ou vazado por um log. O acesso direto tem que fechar.
  it('colaborador não apaga anexo restrito nem sabendo o id', async () => {
    const res = await asUser(emp).delete(`/admin/clients/${cliente}/attachments/${restrito}`)
    expect(res.status).toBe(404)
  })

  it('a contagem de anexos da listagem não conta os restritos para o colaborador', async () => {
    const res = await asUser(emp).get('/admin/clients')
    expect(res.body.find((c) => c.id === cliente).attachment_count).toBe(1)
  })

  it('para o admin a contagem é a real', async () => {
    const res = await asUser(admin).get('/admin/clients')
    expect(res.body.find((c) => c.id === cliente).attachment_count).toBe(2)
  })

  it('só admin marca anexo como restrito', async () => {
    expect((await asUser(emp).put(`/admin/clients/${cliente}/attachments/${aberto}`)
      .send({ is_restricted: true })).status).toBe(403)
    expect((await asUser(admin).put(`/admin/clients/${cliente}/attachments/${aberto}`)
      .send({ is_restricted: true })).status).toBe(200)
  })
})
