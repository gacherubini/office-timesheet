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

  it('domínio (todos) cita status do projeto, andamento e simulação de performance', () => {
    const p = buildSystemPrompt({ role: 'employee' })
    expect(p).toMatch(/status do projeto|retrato do projeto/i)
    expect(p).toMatch(/andamento do projeto|o que mudou no projeto/i)
    expect(p).toMatch(/simulação de performance|horas planejadas/i)
  })

  it('domínio (todos os papéis) cita as ações de escrita: iniciar apontamento e criar tarefa', () => {
    for (const role of ['admin', 'employee']) {
      const p = buildSystemPrompt({ role })
      expect(p).toMatch(/iniciar (um )?apontamento|começar o timer/i)
      expect(p).toMatch(/criar (uma )?tarefa/i)
      expect(p).toMatch(/confirma/i) // deixa claro que escrita é sempre confirmada
    }
  })

  it('domínio do admin descreve a consulta SQL ad-hoc e seus limites', () => {
    const p = buildSystemPrompt({ role: 'admin' })
    expect(p).toMatch(/consultar_dados|consulta ad-hoc|SQL/i)
    expect(p).toMatch(/somente leitura|só leitura|SELECT/i)
  })

  it('domínio do colaborador NÃO menciona a consulta SQL', () => {
    const p = buildSystemPrompt({ role: 'employee' })
    expect(p).not.toMatch(/consultar_dados/i)
  })

  it('estagiário administrativo tem fatia própria: aprova pedidos, mas não vê custo de hora', () => {
    const p = buildSystemPrompt({ role: 'administrative_intern' })
    expect(p).toMatch(/aprovador|aprova/i)
    // Ele vê valor de despesa (é quem aprova), mas não o custo/hora das pessoas:
    expect(p).not.toMatch(/valor\/hora|hourly_rate|cost_snapshot/i)
    // E não recebe a fatia do colaborador, que nega TODA informação financeira:
    expect(p).not.toMatch(/Não há informação financeira nem de custo/i)
  })
})

describe('prompt — data de hoje', () => {
  const now = new Date('2026-08-10T12:00:00Z') // 09:00 em America/Sao_Paulo

  it('injeta a data corrente (ISO no fuso do estúdio) para resolver datas relativas', () => {
    const p = buildSystemPrompt({ role: 'admin' }, now)
    expect(p).toMatch(/# Data de hoje/)
    expect(p).toContain('2026-08-10')
  })

  it('orienta a assumir o ano corrente quando a data vier sem ano', () => {
    const p = buildSystemPrompt({ role: 'employee' }, now)
    expect(p).toMatch(/assuma o ano corrente/i)
  })
})

describe('prompt — identidade de quem está falando (§5)', () => {
  const perfil = { id: 'u-123', name: 'Maria Souza', email: 'maria@studio.com', role: 'employee', position: 'Designer' }

  it('injeta o nome do usuário autenticado no prompt', () => {
    expect(buildSystemPrompt(perfil)).toMatch(/Maria Souza/)
  })

  it('proíbe perguntar "quem é você" — a identidade já veio do login', () => {
    const p = buildSystemPrompt(perfil)
    expect(p).toMatch(/nunca pergunte.*quem é você|não pergunte.*quem é você/i)
    expect(p).toMatch(/identidade já (foi )?resolvid[ao] pelo login/i)
  })

  it('resolve "eu/meu/minhas horas/lancei" como o próprio usuário', () => {
    expect(buildSystemPrompt(perfil)).toMatch(/minhas horas|lancei/i)
  })

  it('inclui o cargo (position) quando existe', () => {
    expect(buildSystemPrompt(perfil)).toMatch(/Designer/)
  })

  it('não quebra nem injeta identidade quando o perfil não traz nome (compat. com os testes por papel)', () => {
    expect(() => buildSystemPrompt({ role: 'admin' })).not.toThrow()
    expect(buildSystemPrompt({ role: 'admin' })).not.toMatch(/Quem está falando com você/i)
  })
})
