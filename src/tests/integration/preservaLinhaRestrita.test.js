// Mesmo bug do preservaCampoRestrito.test.js, um nível abaixo: gravarFilhas()
// faz DELETE + INSERT das linhas de telefone/e-mail/endereço, e o INSERT não
// incluía is_restricted — então toda linha reinserida voltava com o default
// `false`. Efeito real: admin marca o telefone de recado como restrito,
// alguém edita o e-mail do mesmo cliente e salva, e a restrição do telefone
// desaparece sem aviso.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin } from '../helpers/factories.js'

describe('PUT preserva is_restricted de linha de contato', () => {
  let admin, emp, cliente

  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    // Estagiário administrativo gerencia clientes mas NÃO é admin — o mesmo
    // perfil do preservaCampoRestrito.test.js.
    emp = await makeUser({ role: 'administrative_intern', name: 'Estagiária' })

    const criado = await asUser(admin).post('/admin/clients').send({
      name: 'Fulano',
      phones: [
        { label: 'celular', value: '11999990000', is_primary: true },
        { label: 'recado', value: '1133330000' },
      ],
      emails: [{ label: 'pessoal', value: 'fulano@x.com' }],
    })
    cliente = criado.body.id

    // Admin marca o telefone de recado como restrito.
    const ficha = await asUser(admin).get(`/admin/clients/${cliente}`)
    const recado = ficha.body.phones.find((p) => p.label === 'recado')
    const marcado = await asUser(admin).put(`/admin/clients/${cliente}`).send({
      name: 'Fulano',
      phones: ficha.body.phones.map((p) => ({
        id: p.id, label: p.label, value: p.value, is_primary: p.is_primary,
        is_restricted: p.id === recado.id,
      })),
      emails: ficha.body.emails.map((e) => ({ id: e.id, label: e.label, value: e.value, is_primary: e.is_primary })),
    })
    expect(marcado.status).toBe(200)

    // gravarFilhas substitui a linha inteira (DELETE + INSERT): o id de
    // `recado` já não existe mais depois deste PUT — a leitura tem que ser
    // pelo label, que é o que sobrevive.
    const { rows } = await query(
      `SELECT is_restricted FROM person_phones WHERE client_id = $1 AND label = 'recado'`, [cliente])
    expect(rows[0].is_restricted).toBe(true)
  })

  async function telefoneRecadoRestrito() {
    const { rows } = await query(
      `SELECT is_restricted FROM person_phones WHERE client_id = $1 AND label = 'recado'`, [cliente])
    return rows[0]?.is_restricted
  }

  it('outro PUT de admin mexendo só no e-mail preserva a restrição do telefone', async () => {
    const ficha = await asUser(admin).get(`/admin/clients/${cliente}`)
    const res = await asUser(admin).put(`/admin/clients/${cliente}`).send({
      name: 'Fulano',
      phones: ficha.body.phones.map((p) => ({ id: p.id, label: p.label, value: p.value, is_primary: p.is_primary })),
      emails: [{ label: 'novo', value: 'novo@x.com' }],
    })
    expect(res.status).toBe(200)
    expect(await telefoneRecadoRestrito()).toBe(true)
  })

  it('outro PUT de estagiário mexendo só no e-mail preserva a restrição do telefone', async () => {
    // O estagiário nem vê o telefone restrito na ficha (filtrarLinhasRestritas
    // já remove a linha) — ele reenvia só o que recebeu.
    const ficha = await asUser(emp).get(`/admin/clients/${cliente}`)
    expect(ficha.body.phones.find((p) => p.label === 'recado')).toBeUndefined()

    const res = await asUser(emp).put(`/admin/clients/${cliente}`).send({
      name: 'Fulano',
      phones: ficha.body.phones.map((p) => ({ id: p.id, label: p.label, value: p.value, is_primary: p.is_primary })),
      emails: [{ label: 'novo', value: 'novo@x.com' }],
    })
    expect(res.status).toBe(200)
    expect(await telefoneRecadoRestrito()).toBe(true)
  })

  it('estagiário não consegue desmarcar mandando is_restricted: false', async () => {
    const { rows } = await query(
      `SELECT id FROM person_phones WHERE client_id = $1 AND label = 'recado'`, [cliente])
    const recadoId = rows[0].id

    const res = await asUser(emp).put(`/admin/clients/${cliente}`).send({
      name: 'Fulano',
      // Chamada direta à API: o formulário do estagiário nem mostra a linha,
      // mas nada impede o corpo de trazer o id e forçar is_restricted: false.
      phones: [
        { label: 'celular', value: '11999990000', is_primary: true },
        { id: recadoId, label: 'recado', value: '1133330000', is_restricted: false },
      ],
      emails: [{ label: 'pessoal', value: 'fulano@x.com' }],
    })
    expect(res.status).toBe(200)
    expect(await telefoneRecadoRestrito()).toBe(true)
  })

  it('admin consegue desmarcar de propósito mandando is_restricted: false', async () => {
    const { rows } = await query(
      `SELECT id FROM person_phones WHERE client_id = $1 AND label = 'recado'`, [cliente])
    const recadoId = rows[0].id

    const res = await asUser(admin).put(`/admin/clients/${cliente}`).send({
      name: 'Fulano',
      phones: [
        { label: 'celular', value: '11999990000', is_primary: true },
        { id: recadoId, label: 'recado', value: '1133330000', is_restricted: false },
      ],
      emails: [{ label: 'pessoal', value: 'fulano@x.com' }],
    })
    expect(res.status).toBe(200)
    expect(await telefoneRecadoRestrito()).toBe(false)
  })

  it('linha nova nasce não-restrita mesmo se o corpo tentar marcar sem admin', async () => {
    const res = await asUser(emp).put(`/admin/clients/${cliente}`).send({
      name: 'Fulano',
      phones: [
        { label: 'celular', value: '11999990000', is_primary: true },
        { label: 'novo contato', value: '1144440000', is_restricted: true },
      ],
      emails: [{ label: 'pessoal', value: 'fulano@x.com' }],
    })
    expect(res.status).toBe(200)
    const { rows } = await query(
      `SELECT is_restricted FROM person_phones WHERE client_id = $1 AND label = 'novo contato'`, [cliente])
    expect(rows[0].is_restricted).toBe(false)
  })

  it('linha nova criada pelo admin com is_restricted: true nasce restrita', async () => {
    const ficha = await asUser(admin).get(`/admin/clients/${cliente}`)
    const res = await asUser(admin).put(`/admin/clients/${cliente}`).send({
      name: 'Fulano',
      phones: [
        ...ficha.body.phones.map((p) => ({ id: p.id, label: p.label, value: p.value, is_primary: p.is_primary, is_restricted: p.is_restricted })),
        { label: 'novo restrito', value: '1155550000', is_restricted: true },
      ],
      emails: ficha.body.emails.map((e) => ({ id: e.id, label: e.label, value: e.value, is_primary: e.is_primary })),
    })
    expect(res.status).toBe(200)
    const { rows } = await query(
      `SELECT is_restricted FROM person_phones WHERE client_id = $1 AND label = 'novo restrito'`, [cliente])
    expect(rows[0].is_restricted).toBe(true)
  })

  it('vale para fornecedor também', async () => {
    const criado = await asUser(admin).post('/admin/suppliers').send({
      name: 'Marcenaria',
      phones: [{ label: 'comercial', value: '1122223333', is_primary: true }],
      emails: [{ label: 'nf', value: 'nf@marcenaria.com' }],
    })
    const fornecedor = criado.body.id
    const ficha1 = await asUser(admin).get(`/admin/suppliers/${fornecedor}`)
    const email = ficha1.body.emails[0]

    await asUser(admin).put(`/admin/suppliers/${fornecedor}`).send({
      name: 'Marcenaria',
      phones: ficha1.body.phones.map((p) => ({ id: p.id, label: p.label, value: p.value, is_primary: p.is_primary })),
      emails: [{ id: email.id, label: email.label, value: email.value, is_primary: email.is_primary, is_restricted: true }],
    })
    // gravarFilhas substitui a linha inteira: o id de antes do PUT já não
    // existe mais — a leitura tem que ser pelo label.
    const { rows: r1 } = await query(
      `SELECT id, is_restricted FROM person_emails WHERE supplier_id = $1 AND label = 'nf'`, [fornecedor])
    expect(r1[0].is_restricted).toBe(true)

    // Outro PUT, agora só mexendo no telefone — a restrição do e-mail deve
    // continuar, usando o id NOVO devolvido pela ficha (não o de antes).
    const ficha2 = await asUser(admin).get(`/admin/suppliers/${fornecedor}`)
    const emailAtual = ficha2.body.emails.find((e) => e.label === 'nf')
    await asUser(admin).put(`/admin/suppliers/${fornecedor}`).send({
      name: 'Marcenaria Editada',
      phones: [{ label: 'novo', value: '1199998888' }],
      emails: [{ id: emailAtual.id, label: emailAtual.label, value: emailAtual.value, is_primary: emailAtual.is_primary }],
    })
    const { rows: r2 } = await query(
      `SELECT is_restricted FROM person_emails WHERE supplier_id = $1 AND label = 'nf'`, [fornecedor])
    expect(r2[0].is_restricted).toBe(true)
  })
})
