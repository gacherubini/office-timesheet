import { describe, it, expect } from 'vitest'
import { COLUMNS, statusLabel, montarPayloadProjeto, activityText } from './helpers'

describe('COLUMNS do quadro', () => {
  it('tem cinco colunas na ordem do PDF', () => {
    expect(COLUMNS.map((c) => c.key)).toEqual(['todo', 'in_progress', 'blocked', 'in_review', 'done'])
  })

  it('"Falta info" fica ENTRE fazendo e em revisão', () => {
    const chaves = COLUMNS.map((c) => c.key)
    expect(chaves.indexOf('blocked')).toBe(chaves.indexOf('in_progress') + 1)
    expect(chaves.indexOf('blocked')).toBe(chaves.indexOf('in_review') - 1)
  })

  it('o rótulo é "Falta info"', () => {
    expect(COLUMNS.find((c) => c.key === 'blocked').label).toBe('Falta info')
    expect(statusLabel('blocked')).toBe('Falta info')
  })

  it('os rótulos existentes não mudaram', () => {
    expect(statusLabel('todo')).toBe('A fazer')
    expect(statusLabel('in_progress')).toBe('Fazendo')
    expect(statusLabel('in_review')).toBe('Em revisão')
    expect(statusLabel('done')).toBe('Concluído')
    expect(statusLabel('abandoned')).toBe('Abandonado')
  })
})

// Bug real: o modal de edição abre otimista com só o contratante principal
// (a listagem não traz os outros) enquanto GET /projects/:id busca a ficha
// completa em paralelo. Se esse GET não tiver voltado (ou tiver falhado) na
// hora de salvar, o PUT NÃO pode mandar `clients` — mandaria uma lista
// incompleta e o backend (que trata `clients` como substituição total)
// apagaria investidor/representante. Ao criar não existe "carregado do
// servidor": `clients` sempre vai.
describe('montarPayloadProjeto', () => {
  const formBase = {
    name: '  Grand Terroir 31  ',
    clients: [{ client_id: 'c1', role: 'contratante_principal', is_primary: true }],
    address: '  Rua X  ',
    start_date: '2026-08-01',
  }

  it('ao criar, sempre inclui clients', () => {
    const payload = montarPayloadProjeto(formBase, { wasEditing: false, clientesCarregados: false })
    expect(payload.clients).toEqual(formBase.clients)
  })

  it('ao editar com a ficha completa já carregada, inclui clients', () => {
    const payload = montarPayloadProjeto(formBase, { wasEditing: true, clientesCarregados: true })
    expect(payload.clients).toEqual(formBase.clients)
  })

  it('ao editar SEM a ficha completa carregada, omite clients (não apaga vínculos)', () => {
    const payload = montarPayloadProjeto(formBase, { wasEditing: true, clientesCarregados: false })
    expect(payload).not.toHaveProperty('clients')
  })

  it('sempre normaliza nome e endereço, com ou sem clients', () => {
    const payload = montarPayloadProjeto(formBase, { wasEditing: true, clientesCarregados: false })
    expect(payload.name).toBe('Grand Terroir 31')
    expect(payload.address).toBe('Rua X')
    expect(payload.start_date).toBe('2026-08-01')
  })

  it('endereço em branco vira null', () => {
    const payload = montarPayloadProjeto({ ...formBase, address: '   ' }, { wasEditing: false, clientesCarregados: true })
    expect(payload.address).toBeNull()
  })
})

// Bug real: stage_changed guardava só uuids de project_stages no detail
// (from/to), e activityText() não tinha caso pra esse tipo — caía no
// default e virava "Ana · stage_changed" no popover de histórico. A correção
// grava from_name/to_name junto (src/lib/taskEdits.js), e activityText usa
// os nomes. Atividade gravada ANTES da correção não tem esses campos —
// precisa degradar sem mostrar "undefined".
describe('activityText — stage_changed', () => {
  it('com detail completo (from_name/to_name), mostra os dois nomes da etapa', () => {
    const texto = activityText({
      actor_name: 'Ana',
      type: 'stage_changed',
      detail: { from: 'uuid-1', to: 'uuid-2', from_name: 'Anteprojeto', to_name: 'Executivo' },
    })
    expect(texto).toBe('Ana mudou a etapa (Anteprojeto → Executivo)')
  })

  it('com detail legado (só uuids, sem from_name/to_name), não mostra "undefined"', () => {
    const texto = activityText({
      actor_name: 'Ana',
      type: 'stage_changed',
      detail: { from: 'uuid-1', to: 'uuid-2' },
    })
    expect(texto).not.toMatch(/undefined/)
    expect(texto).toBe('Ana mudou a etapa (uma etapa → uma etapa)')
  })
})
