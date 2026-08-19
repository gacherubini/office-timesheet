import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeAdmin } from '../helpers/factories.js'

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
})
