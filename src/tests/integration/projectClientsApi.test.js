import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeAdmin, makeUser } from '../helpers/factories.js'

async function cliente(admin, nome) {
  const res = await asUser(admin).post('/admin/clients').send({ name: nome })
  return res.body.id
}

describe('API — vários contratantes por projeto', () => {
  let admin, luiz, marina
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    luiz = await cliente(admin, 'Luiz Eduardo')
    marina = await cliente(admin, 'Marina')
  })

  it('cria projeto com dois contratantes', async () => {
    const res = await asUser(admin).post('/projects').send({
      name: 'Grand Terroir 31',
      start_date: '2026-08-01',
      clients: [
        { client_id: luiz, role: 'contratante_principal', is_primary: true },
        { client_id: marina, role: 'contratante' },
      ],
    })
    expect(res.status).toBe(201)

    const ficha = await asUser(admin).get(`/projects/${res.body.id}`)
    expect(ficha.body.clients).toHaveLength(2)
    expect(ficha.body.clients.find((c) => c.is_primary).name).toBe('Luiz Eduardo')
  })

  // A invariante que mantém os leitores antigos funcionando.
  it('projects.client_id acompanha o contratante principal', async () => {
    const res = await asUser(admin).post('/projects').send({
      name: 'Obra',
      start_date: '2026-08-01',
      clients: [
        { client_id: luiz, role: 'contratante_principal', is_primary: true },
        { client_id: marina, role: 'contratante' },
      ],
    })
    const { rows } = await query(`SELECT client_id, client FROM projects WHERE id = $1`, [res.body.id])
    expect(rows[0].client_id).toBe(luiz)
    expect(rows[0].client).toBe('Luiz Eduardo')
  })

  it('trocar o principal atualiza projects.client_id', async () => {
    const res = await asUser(admin).post('/projects').send({
      name: 'Obra',
      start_date: '2026-08-01',
      clients: [{ client_id: luiz, is_primary: true }, { client_id: marina }],
    })
    await asUser(admin).put(`/projects/${res.body.id}`).send({
      clients: [{ client_id: luiz }, { client_id: marina, is_primary: true }],
    })
    const { rows } = await query(`SELECT client_id, client FROM projects WHERE id = $1`, [res.body.id])
    expect(rows[0].client_id).toBe(marina)
    expect(rows[0].client).toBe('Marina')
  })

  it('promove o primeiro quando nenhum é marcado principal', async () => {
    const res = await asUser(admin).post('/projects').send({
      name: 'Obra',
      start_date: '2026-08-01',
      clients: [{ client_id: luiz }, { client_id: marina }],
    })
    const ficha = await asUser(admin).get(`/projects/${res.body.id}`)
    expect(ficha.body.clients.find((c) => c.is_primary).name).toBe('Luiz Eduardo')
  })

  it('recusa dois principais com mensagem legível', async () => {
    const res = await asUser(admin).post('/projects').send({
      name: 'Obra',
      start_date: '2026-08-01',
      clients: [{ client_id: luiz, is_primary: true }, { client_id: marina, is_primary: true }],
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/apenas um.*principal/i)
  })

  it('recusa projeto sem nenhum cliente', async () => {
    const res = await asUser(admin).post('/projects').send({ name: 'Obra', start_date: '2026-08-01', clients: [] })
    expect(res.status).toBe(400)
  })

  it('recusa projeto sem data de início', async () => {
    const res = await asUser(admin).post('/projects').send({
      name: 'Obra',
      clients: [{ client_id: luiz, is_primary: true }],
    })
    expect(res.status).toBe(400)
    const { rows } = await query(`SELECT count(*)::int AS c FROM projects`)
    expect(rows[0].c).toBe(0)
  })

  it('recusa papel inválido antes de tocar no banco', async () => {
    const res = await asUser(admin).post('/projects').send({
      name: 'Obra', start_date: '2026-08-01', clients: [{ client_id: luiz, role: 'padrinho' }],
    })
    expect(res.status).toBe(400)
    const { rows } = await query(`SELECT count(*)::int AS c FROM projects`)
    expect(rows[0].c).toBe(0)
  })

  it('o contador da ficha da pessoa conta todos os papéis', async () => {
    const investidor = await cliente(admin, 'Investidor')
    await asUser(admin).post('/projects').send({
      name: 'Obra A',
      start_date: '2026-08-01',
      clients: [{ client_id: luiz, is_primary: true }, { client_id: investidor, role: 'investidor' }],
    })
    await asUser(admin).post('/projects').send({
      name: 'Obra B',
      start_date: '2026-08-01',
      clients: [{ client_id: investidor, role: 'investidor', is_primary: true }],
    })
    const ficha = await asUser(admin).get(`/admin/clients/${investidor}`)
    expect(ficha.body.project_count).toBe(2)
  })

  it('o projeto aparece na ficha dos dois contratantes', async () => {
    await asUser(admin).post('/projects').send({
      name: 'Grand Terroir 31',
      start_date: '2026-08-01',
      clients: [{ client_id: luiz, is_primary: true }, { client_id: marina, role: 'contratante' }],
    })
    for (const id of [luiz, marina]) {
      const ficha = await asUser(admin).get(`/admin/clients/${id}`)
      expect(ficha.body.projects.map((p) => p.name)).toContain('Grand Terroir 31')
    }
  })

  // Bug real: o modal de edição abre otimista com só o principal (a listagem
  // não traz os outros contratantes) enquanto busca a ficha completa em
  // paralelo. Se o usuário salvar antes dessa resposta chegar — ou se ela
  // falhar — o PUT não pode mandar `clients` incompleto e apagar investidor e
  // representante. Mesma regra de "chave ausente preserva" de
  // src/routes/clients.js (preservarLinhasInvisiveis/resolverRestricaoLinhas).
  it('PUT sem a chave clients preserva os vínculos existentes', async () => {
    const investidor = await cliente(admin, 'Investidor')
    const criado = await asUser(admin).post('/projects').send({
      name: 'Grand Terroir 31',
      start_date: '2026-08-01',
      clients: [
        { client_id: luiz, role: 'contratante_principal', is_primary: true },
        { client_id: marina, role: 'contratante' },
        { client_id: investidor, role: 'investidor' },
      ],
    })
    expect(criado.status).toBe(201)

    // PUT só mexe no nome — corpo nem toca em `clients`.
    const put = await asUser(admin).put(`/projects/${criado.body.id}`).send({ name: 'Grand Terroir 31 — Fase 2' })
    expect(put.status).toBe(200)

    const ficha = await asUser(admin).get(`/projects/${criado.body.id}`)
    expect(ficha.body.clients).toHaveLength(3)
    expect(ficha.body.clients.map((c) => c.client_id).sort()).toEqual([investidor, luiz, marina].sort())
    expect(ficha.body.clients.find((c) => c.is_primary).client_id).toBe(luiz)
  })

  it('PUT com a chave clients substitui os vínculos', async () => {
    const investidor = await cliente(admin, 'Investidor')
    const criado = await asUser(admin).post('/projects').send({
      name: 'Grand Terroir 31',
      start_date: '2026-08-01',
      clients: [
        { client_id: luiz, role: 'contratante_principal', is_primary: true },
        { client_id: marina, role: 'contratante' },
        { client_id: investidor, role: 'investidor' },
      ],
    })
    expect(criado.status).toBe(201)

    const put = await asUser(admin).put(`/projects/${criado.body.id}`).send({
      clients: [{ client_id: marina, role: 'contratante_principal', is_primary: true }],
    })
    expect(put.status).toBe(200)

    const ficha = await asUser(admin).get(`/projects/${criado.body.id}`)
    expect(ficha.body.clients).toHaveLength(1)
    expect(ficha.body.clients[0].client_id).toBe(marina)
  })
})

// Item 2 do bloco de 19/08/2026: um investidor (vínculo SECUNDÁRIO)
// admin_only vazava o nome pelo clients[] de GET /projects/:id mesmo a ficha
// direta dele devolvendo 404 para quem não é admin.
describe('admin_only no clients[] de GET /projects/:id', () => {
  let admin, emp, luiz, investidor
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    emp = await makeUser({ role: 'employee' })
    luiz = await cliente(admin, 'Luiz Eduardo')
    const res = await asUser(admin).post('/admin/clients').send({ name: 'Investidor Oculto' })
    investidor = res.body.id
    await query(`UPDATE clients SET admin_only = true WHERE id = $1`, [investidor])
  })

  it('vínculo secundário admin_only some do clients[] para quem não é admin', async () => {
    const criado = await asUser(admin).post('/projects').send({
      name: 'Grand Terroir 31',
      start_date: '2026-08-01',
      clients: [
        { client_id: luiz, role: 'contratante_principal', is_primary: true },
        { client_id: investidor, role: 'investidor' },
      ],
    })
    expect(criado.status).toBe(201)

    const ficha = await asUser(emp).get(`/projects/${criado.body.id}`)
    expect(ficha.body.clients).toHaveLength(1)
    expect(ficha.body.clients.map((c) => c.client_id)).not.toContain(investidor)
    expect(JSON.stringify(ficha.body)).not.toContain('Investidor Oculto')
  })

  it('vínculo secundário admin_only continua aparecendo para o admin', async () => {
    const criado = await asUser(admin).post('/projects').send({
      name: 'Grand Terroir 31',
      start_date: '2026-08-01',
      clients: [
        { client_id: luiz, role: 'contratante_principal', is_primary: true },
        { client_id: investidor, role: 'investidor' },
      ],
    })
    expect(criado.status).toBe(201)

    const ficha = await asUser(admin).get(`/projects/${criado.body.id}`)
    expect(ficha.body.clients.map((c) => c.client_id)).toContain(investidor)
  })

  // O contratante PRINCIPAL não é afetado pelo gate — mesmo admin_only, ele
  // segue titulando o card (projects.client, coluna denormalizada) e
  // continua aparecendo em clients[] (é a mesma pessoa que já titula o card
  // sem restrição — escondê-la só do array deixaria a ficha inconsistente).
  it('contratante principal admin_only não some — o card não fica sem título', async () => {
    const criado = await asUser(admin).post('/projects').send({
      name: 'Grand Terroir 31',
      start_date: '2026-08-01',
      clients: [{ client_id: investidor, role: 'contratante_principal', is_primary: true }],
    })
    expect(criado.status).toBe(201)

    const ficha = await asUser(emp).get(`/projects/${criado.body.id}`)
    expect(ficha.body.client).toBe('Investidor Oculto')
    expect(ficha.body.clients).toHaveLength(1)
    expect(ficha.body.clients[0].client_id).toBe(investidor)
  })
})
