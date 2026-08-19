// O colaborador não recebe o campo restrito, então o PUT dele chega sem o
// campo. Se a rota gravar o que chegou, apaga um dado que ele nunca viu.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin } from '../helpers/factories.js'

describe('PUT preserva campo restrito não recebido', () => {
  let admin, emp, cliente
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    // Estagiário administrativo gerencia clientes mas NÃO é admin — é
    // exatamente o perfil que dispara este bug.
    emp = await makeUser({ role: 'administrative_intern', name: 'Estagiária' })
    const res = await asUser(admin).post('/admin/clients').send({
      name: 'Fulano', cpf: '123.456.789-00', rg: '12.345.678-9',
    })
    cliente = res.body.id
  })

  it('salvar sem o CPF NÃO apaga o CPF', async () => {
    const ficha = await asUser(emp).get(`/admin/clients/${cliente}`)
    expect('cpf' in ficha.body).toBe(false)

    const res = await asUser(emp).put(`/admin/clients/${cliente}`).send({
      name: 'Fulano Editado',
      phones: [{ label: 'celular', value: '11999990000' }],
    })
    expect(res.status).toBe(200)

    const { rows } = await query(`SELECT name, cpf, rg FROM clients WHERE id = $1`, [cliente])
    expect(rows[0].name).toBe('Fulano Editado')
    expect(rows[0].cpf).toBe('123.456.789-00')
    expect(rows[0].rg).toBe('12.345.678-9')
  })

  it('admin PODE apagar o CPF de propósito, mandando vazio', async () => {
    await asUser(admin).put(`/admin/clients/${cliente}`).send({ name: 'Fulano', cpf: '' })
    const { rows } = await query(`SELECT cpf FROM clients WHERE id = $1`, [cliente])
    expect(rows[0].cpf).toBeNull()
  })

  it('admin altera o CPF normalmente', async () => {
    await asUser(admin).put(`/admin/clients/${cliente}`).send({ name: 'Fulano', cpf: '999.999.999-99' })
    const { rows } = await query(`SELECT cpf FROM clients WHERE id = $1`, [cliente])
    expect(rows[0].cpf).toBe('999.999.999-99')
  })

  it('campo NÃO restrito é apagável por quem gerencia', async () => {
    await asUser(admin).put(`/admin/clients/${cliente}`).send({
      name: 'Fulano', cpf: '123.456.789-00', restricted_fields: ['rg'],
    })
    await asUser(emp).put(`/admin/clients/${cliente}`).send({ name: 'Fulano', cpf: '' })
    const { rows } = await query(`SELECT cpf, rg FROM clients WHERE id = $1`, [cliente])
    expect(rows[0].cpf).toBeNull()
    expect(rows[0].rg).toBe('12.345.678-9')
  })

  it('vale para fornecedor também', async () => {
    const criado = await asUser(admin).post('/admin/suppliers').send({
      name: 'Marcenaria', pix_key: 'nf@marcenaria.com',
    })
    await asUser(emp).put(`/admin/suppliers/${criado.body.id}`).send({ name: 'Marcenaria Editada' })
    const { rows } = await query(`SELECT name, pix_key FROM suppliers WHERE id = $1`, [criado.body.id])
    expect(rows[0].name).toBe('Marcenaria Editada')
    expect(rows[0].pix_key).toBe('nf@marcenaria.com')
  })

  // BLOQUEADOR 2 (revisão final, 19/08/2026): os casos acima OMITEM a chave
  // `cpf` do corpo — mas ClientFormModal.jsx inicializa `cpf: ''` e refila
  // `cpf: ficha.cpf || ''`. Para não-admin a ficha não tem a chave `cpf` (ela
  // foi removida por aplicarVisibilidade), então vira ''. O submit manda
  // `{...form}` — ou seja, o payload REAL de produção sempre contém
  // `cpf: ''`, nunca a chave ausente. O bloco "campo restringível que o corpo
  // nem tocou preserva o valor atual" (req.body[campo] === undefined) NUNCA
  // dispara nesse caminho — quem protege de verdade é o bloco seguinte
  // ("quem não podia VER o campo não pode APAGÁ-LO"), que ignora o valor do
  // corpo e sempre usa o valor existente para campo restrito e não-admin.
  // Este teste reproduz o payload de verdade e prova que esse segundo bloco
  // segura a barra.
  it('salvar com cpf vazio (payload real do formulário) NÃO apaga o CPF restrito', async () => {
    const ficha = await asUser(emp).get(`/admin/clients/${cliente}`)
    expect('cpf' in ficha.body).toBe(false)

    // Reproduz exatamente o que ClientFormModal.jsx manda: `cpf: ''`, porque
    // ficha.cpf era undefined e o form caiu no fallback `|| ''`.
    const res = await asUser(emp).put(`/admin/clients/${cliente}`).send({
      name: 'Fulano Editado', cpf: '',
      phones: [{ label: 'celular', value: '11999990000' }],
    })
    expect(res.status).toBe(200)

    const { rows } = await query(`SELECT name, cpf, rg FROM clients WHERE id = $1`, [cliente])
    expect(rows[0].name).toBe('Fulano Editado')
    expect(rows[0].cpf).toBe('123.456.789-00')
    expect(rows[0].rg).toBe('12.345.678-9')
  })

  it('vale para fornecedor também — payload real do formulário com pix_key vazio', async () => {
    const criado = await asUser(admin).post('/admin/suppliers').send({
      name: 'Marcenaria', pix_key: 'nf@marcenaria.com',
    })
    const ficha = await asUser(emp).get(`/admin/suppliers/${criado.body.id}`)
    expect('pix_key' in ficha.body).toBe(false)

    await asUser(emp).put(`/admin/suppliers/${criado.body.id}`).send({
      name: 'Marcenaria Editada', pix_key: '',
    })
    const { rows } = await query(`SELECT name, pix_key FROM suppliers WHERE id = $1`, [criado.body.id])
    expect(rows[0].name).toBe('Marcenaria Editada')
    expect(rows[0].pix_key).toBe('nf@marcenaria.com')
  })
})
