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
})
