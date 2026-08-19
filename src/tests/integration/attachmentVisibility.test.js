import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin } from '../helpers/factories.js'

describe('visibilidade de anexo', () => {
  let admin, emp, intern, cliente, aberto, restrito
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    emp = await makeUser({ role: 'employee' })
    // O estagiário administrativo é quem gerencia clientes sem ser admin — é
    // ele quem de fato vê anexos (GET/DELETE voltaram a requireCanManageClients).
    // O storage sobe com ACL public-read (src/lib/storage.js): quem vê a lista
    // pega uma URL que funciona pra sempre, mesmo depois do documento virar
    // restrito. Por isso o colaborador comum não pode nem chegar perto da lista.
    intern = await makeUser({ role: 'administrative_intern' })
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

  // Colaborador comum não gerencia clientes — nem chega na lista. Gate voltou
  // a requireCanManageClients (era requireCanViewClients, afrouxado e revertido).
  it('colaborador toma 403 na listagem de anexos', async () => {
    const res = await asUser(emp).get(`/admin/clients/${cliente}/attachments`)
    expect(res.status).toBe(403)
  })

  it('estagiário administrativo vê só o aberto', async () => {
    const res = await asUser(intern).get(`/admin/clients/${cliente}/attachments`)
    expect(res.body.map((a) => a.file_name)).toEqual(['briefing.pdf'])
  })

  // Esconder da lista não basta: o id é adivinhável por quem já viu antes de a
  // restrição entrar, ou vazado por um log. O acesso direto tem que fechar.
  it('estagiário administrativo não apaga anexo restrito nem sabendo o id', async () => {
    const res = await asUser(intern).delete(`/admin/clients/${cliente}/attachments/${restrito}`)
    expect(res.status).toBe(404)
  })

  // Colaborador comum toma 403 também no DELETE direto — nem chega a checar
  // se o anexo existe ou está restrito.
  it('colaborador toma 403 ao tentar apagar anexo direto pelo id', async () => {
    const res = await asUser(emp).delete(`/admin/clients/${cliente}/attachments/${restrito}`)
    expect(res.status).toBe(403)
  })

  // A contagem tem que refletir o que a pessoa pode de fato ver. Colaborador
  // comum nunca chega na lista de anexos (403 acima) — a contagem para ele é
  // zero, não "1 (só o não-restrito)".
  it('a contagem de anexos da listagem é zero para quem não gerencia clientes', async () => {
    const res = await asUser(emp).get('/admin/clients')
    expect(res.body.find((c) => c.id === cliente).attachment_count).toBe(0)
  })

  it('a contagem de anexos da listagem não conta os restritos para o estagiário administrativo', async () => {
    const res = await asUser(intern).get('/admin/clients')
    expect(res.body.find((c) => c.id === cliente).attachment_count).toBe(1)
  })

  it('para o admin a contagem é a real', async () => {
    const res = await asUser(admin).get('/admin/clients')
    expect(res.body.find((c) => c.id === cliente).attachment_count).toBe(2)
  })

  it('só admin marca anexo como restrito', async () => {
    expect((await asUser(intern).put(`/admin/clients/${cliente}/attachments/${aberto}`)
      .send({ is_restricted: true })).status).toBe(403)
    expect((await asUser(admin).put(`/admin/clients/${cliente}/attachments/${aberto}`)
      .send({ is_restricted: true })).status).toBe(200)
  })
})
