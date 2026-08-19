import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../../helpers/db.js'
import { makeProject } from '../../helpers/factories.js'
import { resolverEtapa } from '../../../lib/agent/tools/etapas.js'

describe('resolverEtapa', () => {
  let acme, obra2
  beforeEach(async () => {
    await resetDb()
    acme = await makeProject({ name: 'Acme' })
    obra2 = await makeProject({ name: 'Obra 2' })
  })

  it('projeto sem etapa nenhuma → recusa dizendo que precisa criar etapas primeiro', async () => {
    await expect(resolverEtapa(undefined, acme)).rejects.toThrow(/etapa/i)
    await expect(resolverEtapa(undefined, acme)).rejects.toThrow(/Acme/)
  })

  it('projeto com exatamente uma etapa → usa essa etapa sem precisar dizer o nome', async () => {
    await query(`INSERT INTO project_stages (project_id, name) VALUES ($1, 'Anteprojeto')`, [acme.id])
    const etapa = await resolverEtapa(undefined, acme)
    expect(etapa.name).toBe('Anteprojeto')
  })

  it('projeto com várias etapas e nome não informado → recusa listando as etapas disponíveis', async () => {
    await query(
      `INSERT INTO project_stages (project_id, name, position) VALUES ($1, 'Anteprojeto', 0), ($1, 'Executivo', 1)`,
      [acme.id],
    )
    await expect(resolverEtapa(undefined, acme)).rejects.toThrow(/Anteprojeto/)
    await expect(resolverEtapa(undefined, acme)).rejects.toThrow(/Executivo/)
  })

  it('nome de etapa resolve dentro do projeto', async () => {
    await query(
      `INSERT INTO project_stages (project_id, name, position) VALUES ($1, 'Anteprojeto', 0), ($1, 'Executivo', 1)`,
      [acme.id],
    )
    const etapa = await resolverEtapa('Executivo', acme)
    expect(etapa.name).toBe('Executivo')
  })

  it('nome de etapa inexistente no projeto → erro legível', async () => {
    await query(`INSERT INTO project_stages (project_id, name) VALUES ($1, 'Anteprojeto')`, [acme.id])
    await expect(resolverEtapa('Maquete física', acme)).rejects.toThrow(/não encontrei/i)
  })

  it('nome ambíguo dentro do MESMO projeto → pede para especificar', async () => {
    await query(
      `INSERT INTO project_stages (project_id, name, position) VALUES ($1, 'Executivo civil', 0), ($1, 'Executivo elétrico', 1)`,
      [acme.id],
    )
    await expect(resolverEtapa('Executivo', acme)).rejects.toThrow(/mais de uma|especifique/i)
  })

  it('mesmo nome de etapa em outro projeto não vaza: resolve só dentro do projeto pedido', async () => {
    await query(`INSERT INTO project_stages (project_id, name) VALUES ($1, 'Anteprojeto')`, [acme.id])
    await query(`INSERT INTO project_stages (project_id, name) VALUES ($1, 'Anteprojeto')`, [obra2.id])
    const etapa = await resolverEtapa('Anteprojeto', acme)
    expect(etapa.name).toBe('Anteprojeto')
    // Não lança ambiguidade mesmo havendo "Anteprojeto" em outro projeto.
  })
})
