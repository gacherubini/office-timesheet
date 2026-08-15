import { describe, it, expect } from 'vitest'
import { hrefPermitido } from './agentLinks.js'

const UUID = '11111111-1111-4111-8111-111111111111'
const UUID2 = '22222222-2222-4222-8222-222222222222'

describe('hrefPermitido', () => {
  it.each([
    ['javascript:alert(1)', false],
    ['http://evil', false],
    ['/admin/secret', false],
    ['/projetos/../admin/dashboard', false],
    ['/projetos?foo=1', false],
    ['/projetos?project=nao-uuid', false],
    [`/projetos?project=${UUID}&x=1`, false],
    ['/projetos/', false],
    ['/project-board?project=' + UUID, false],
    [`/projetos?project=${UUID}`, true],
    [`/projetos?project=${UUID}&task=${UUID2}`, true],
    [`/tarefas?task=${UUID}`, true],
    ['/admin/approvals', true],
    ['/expenses', true],
    ['/vacations', true],
    ['/agenda', true],
    ['/admin/reports', true],
    ['/performance', true],
    ['/history', true],
    ['/pessoas', true],
    ['/profile', true],
    ['https://example.com', true],
    ['https://example.com/x?q=1', true],
  ])('%s → %s', (href, ok) => {
    expect(hrefPermitido(href)).toBe(ok)
  })
})
