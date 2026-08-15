import { describe, it, expect } from 'vitest'
import { coletarLinks } from '../../../lib/agent/coletarLinks.js'

it('extrai projeto e tarefa dos role:tool deste turno; ignora lixo', () => {
  const links = coletarLinks([
    { role: 'user', content: 'x' },
    { role: 'tool', content: JSON.stringify({ projeto_id: '11111111-1111-4111-8111-111111111111', projeto: 'Acme' }) },
    { role: 'tool', content: JSON.stringify({ data: [{ tarefa_id: '22222222-2222-4222-8222-222222222222', titulo: 'Logo', projeto_id: '11111111-1111-4111-8111-111111111111', projeto: 'Acme' }] }) },
    { role: 'tool', content: 'não-json' },
  ])
  expect(links).toEqual(expect.arrayContaining([
    { href: '/projetos?project=11111111-1111-4111-8111-111111111111', label: 'Acme' },
    { href: '/tarefas?task=22222222-2222-4222-8222-222222222222', label: 'Logo' },
  ]))
})
