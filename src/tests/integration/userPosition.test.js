// Item 5 do PDF: cargo é o que a pessoa FAZ (aparece na tela); perfil de
// permissão é o que ela PODE FAZER no sistema. Hoje são o mesmo campo — o
// backend sobrescreve position com o rótulo do role.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeAdmin } from '../helpers/factories.js'

describe('cargo é campo próprio, não o rótulo da permissão', () => {
  let admin
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
  })

  it('a criação respeita o cargo enviado', async () => {
    await asUser(admin).post('/admin/create-user').send({
      name: 'Ana', email: 'ana@x.com', password: 'segredo123',
      role: 'employee', hourly_rate: 100, position: 'Arquiteto',
    })
    const { rows } = await query(`SELECT position FROM users WHERE email = 'ana@x.com'`)
    expect(rows[0].position).toBe('Arquiteto')
  })

  it('sem cargo enviado, o padrão é Arquiteto — não "Colaborador"', async () => {
    await asUser(admin).post('/admin/create-user').send({
      name: 'Bia', email: 'bia@x.com', password: 'segredo123', role: 'employee', hourly_rate: 100,
    })
    const { rows } = await query(`SELECT position FROM users WHERE email = 'bia@x.com'`)
    expect(rows[0].position).toBe('Arquiteto')
  })

  // O caso que hoje é impossível: dois cargos diferentes na mesma permissão.
  it('duas pessoas com a mesma permissão podem ter cargos diferentes', async () => {
    await asUser(admin).post('/admin/create-user').send({
      name: 'Ana', email: 'ana@x.com', password: 'segredo123',
      role: 'employee', hourly_rate: 100, position: 'Arquiteto',
    })
    await asUser(admin).post('/admin/create-user').send({
      name: 'Bia', email: 'bia@x.com', password: 'segredo123',
      role: 'employee', hourly_rate: 50, position: 'Estagiário',
    })
    const { rows } = await query(`SELECT email, position FROM users WHERE email IN ('ana@x.com','bia@x.com') ORDER BY email`)
    expect(rows.map((r) => r.position)).toEqual(['Arquiteto', 'Estagiário'])
  })

  // A regressão principal: trocar a permissão não pode reescrever o cargo.
  it('mudar a permissão NÃO sobrescreve o cargo', async () => {
    const criado = await asUser(admin).post('/admin/create-user').send({
      name: 'Ana', email: 'ana@x.com', password: 'segredo123',
      role: 'employee', hourly_rate: 100, position: 'Sócio',
    })
    await asUser(admin).put(`/admin/users/${criado.body.user.id}`).send({ role: 'admin' })
    const { rows } = await query(`SELECT role, position FROM users WHERE id = $1`, [criado.body.user.id])
    expect(rows[0].role).toBe('admin')
    expect(rows[0].position).toBe('Sócio')
  })

  it('a edição altera o cargo sem tocar na permissão', async () => {
    const criado = await asUser(admin).post('/admin/create-user').send({
      name: 'Ana', email: 'ana@x.com', password: 'segredo123',
      role: 'employee', hourly_rate: 100, position: 'Estagiário',
    })
    await asUser(admin).put(`/admin/users/${criado.body.user.id}`).send({ position: 'Arquiteto' })
    const { rows } = await query(`SELECT role, position FROM users WHERE id = $1`, [criado.body.user.id])
    expect(rows[0].role).toBe('employee')
    expect(rows[0].position).toBe('Arquiteto')
  })

  it('cargo personalizado é aceito', async () => {
    await asUser(admin).post('/admin/create-user').send({
      name: 'Ana', email: 'ana@x.com', password: 'segredo123',
      role: 'employee', hourly_rate: 100, position: 'Coordenadora de obra',
    })
    const { rows } = await query(`SELECT position FROM users WHERE email = 'ana@x.com'`)
    expect(rows[0].position).toBe('Coordenadora de obra')
  })
})
