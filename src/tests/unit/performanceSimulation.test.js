// O jsonb salvo guarda META (R$) e ajustes de fim de semana — nunca as horas
// dos dias úteis. Estes casos fixam a conta que a tela faz, porque foi
// exatamente aí que a tool do agente errou: somava só os `overrides` e
// anunciava "0 horas planejadas" para quem tinha o mês inteiro planejado.
import { describe, it, expect } from 'vitest'
import { normalizeSimConfig, planejamentoDoMes } from '../../lib/performanceSimulation.js'

// Março/2026 termina assim: 27=sex, 28=sáb, 29=dom, 30=seg, 31=ter.
const MES = '2026-03'

function calcula({ hoje, config, horasRealizadas = 0, valorHora = 100 }) {
  return planejamentoDoMes({
    mes: MES,
    hoje,
    config: normalizeSimConfig(config),
    horasRealizadas,
    valorHora,
  })
}

describe('planejamentoDoMes', () => {
  it('converte o que falta da meta em horas nos dias úteis restantes', () => {
    const p = calcula({
      hoje: '2026-03-10',
      config: { target_amount: 10000 },
      horasRealizadas: 20, // 20h × R$100 = R$2.000 já ganhos
    })
    expect(p.valorRealizado).toBe(2000)
    expect(p.horasParaMeta).toBe(80) // R$8.000 restantes ÷ R$100
    expect(p.horasPlanejadas).toBe(100) // 20 feitas + 80 a fazer
  })

  it('NÃO usa os overrides como as horas planejadas do mês', () => {
    // O bug antigo: com um override de 600 min o resultado era 10h.
    const p = calcula({
      hoje: '2026-03-10',
      config: { target_amount: 10000, overrides: { '2026-03-28': 600 } },
      horasRealizadas: 20,
    })
    expect(p.horasPlanejadas).not.toBe(10)
    expect(p.horasFimDeSemana).toBe(10) // o override é um EXTRA de sábado
    expect(p.horasPlanejadas).toBe(110) // 20 + 80 + 10
  })

  it('só conta fim de semana com override lançado à mão', () => {
    const base = { hoje: '2026-03-27', config: { target_amount: 0 }, horasRealizadas: 0 }
    // Restam 28 (sáb) e 29 (dom); só entram se tiverem override.
    const comOverride = calcula({
      ...base,
      config: { target_amount: 0, overrides: { '2026-03-28': 240, '2026-03-29': 240 } },
    })
    expect(comOverride.horasFimDeSemana).toBe(8)

    const semOverride = calcula(base)
    expect(semOverride.horasFimDeSemana).toBe(0)
  })

  it('ignora fim de semana que já passou', () => {
    // Dia 30 (seg): 28 e 29 ficaram para trás, o override deles não conta.
    const p = calcula({
      hoje: '2026-03-30',
      config: { target_amount: 0, overrides: { '2026-03-28': 240, '2026-03-29': 240 } },
    })
    expect(p.horasFimDeSemana).toBe(0)
  })

  it('mês já encerrado: planejado é exatamente o realizado', () => {
    const p = calcula({
      hoje: '2026-04-15',
      config: { target_amount: 10000 },
      horasRealizadas: 42,
    })
    expect(p.horasPlanejadas).toBe(42)
  })

  it('sem valor/hora não converte meta em horas (não inventa número)', () => {
    const p = calcula({
      hoje: '2026-03-10',
      config: { target_amount: 10000 },
      horasRealizadas: 5,
      valorHora: 0,
    })
    expect(p.horasParaMeta).toBe(0)
    expect(p.horasPlanejadas).toBe(5)
  })

  it('meta já batida não vira hora negativa', () => {
    const p = calcula({
      hoje: '2026-03-10',
      config: { target_amount: 1000 },
      horasRealizadas: 50, // R$5.000 > meta
    })
    expect(p.horasParaMeta).toBe(0)
    expect(p.horasPlanejadas).toBe(50)
  })
})

describe('normalizeSimConfig', () => {
  it('cai nos defaults com jsonb ausente ou de formato antigo', () => {
    for (const bruto of [null, undefined, 'texto', [], { '2026-03-01': 480 }]) {
      const c = normalizeSimConfig(bruto)
      expect(c.target_amount).toBe(0)
      expect(c.overrides).toEqual({})
    }
  })

  it('descarta target_amount inválido em vez de deixar virar NaN', () => {
    expect(normalizeSimConfig({ target_amount: '5000' }).target_amount).toBe(0)
    expect(normalizeSimConfig({ target_amount: -1 }).target_amount).toBe(0)
    expect(normalizeSimConfig({ target_amount: 5000 }).target_amount).toBe(5000)
  })
})
