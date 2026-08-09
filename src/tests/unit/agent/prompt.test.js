import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '../../../lib/agent/prompt.js'

describe('prompt — regras + domínio fatiado', () => {
  it('traz as regras de comportamento do §6', () => {
    const p = buildSystemPrompt({ role: 'admin' })
    expect(p).toMatch(/nunca inventar/i)
    expect(p).toMatch(/confirma/i)     // toda escrita é confirmada
    expect(p).toMatch(/português/i)
  })

  it('admin recebe a fatia financeira; colaborador NÃO', () => {
    const admin = buildSystemPrompt({ role: 'admin' })
    const emp = buildSystemPrompt({ role: 'employee' })
    expect(admin).toMatch(/valor\/hora|custo dos horistas/i)
    expect(emp).not.toMatch(/valor\/hora|hourly_rate/i)
  })

  it('tem regra explícita de não escolher tool quando a pergunta é ambígua', () => {
    const p = buildSystemPrompt({ role: 'admin' })
    expect(p).toMatch(/ambígu/i)
    expect(p).toMatch(/não chame nenhuma ferramenta|não use ferramenta/i)
  })

  it('domínio do admin cita custo por projeto e carga da equipe', () => {
    const p = buildSystemPrompt({ role: 'admin' })
    expect(p).toMatch(/custo por projeto|custo dos horistas/i)
    expect(p).toMatch(/carga da equipe|sobrecarga/i)
  })

  it('domínio do colaborador cita tarefas travadas e férias', () => {
    const p = buildSystemPrompt({ role: 'employee' })
    expect(p).toMatch(/tarefas? travadas?|in_review/i)
    expect(p).toMatch(/férias/i)
  })
})
