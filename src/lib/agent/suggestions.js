// Follow-ups no servidor (§6.6). Não vem do modelo.
import { aberturaDoPapel } from './opening.js'

function norm(s) {
  return String(s || '').toLowerCase().trim()
}

function ehAdmin(role) {
  return role === 'admin'
}

function ehAprovador(role) {
  return role === 'admin' || role === 'administrative_intern'
}

function ancora(context) {
  const nome = context?.projeto?.name
  if (nome) return `Como está o andamento de ${nome}?`
  if (context?.tarefa?.title) return 'Quais tarefas em revisão aqui?'
  return null
}

// Tabela §6.6 — escolhe até 2 por tool; itens de papel só para quem alcança.
function daUltimaTool(tool, role) {
  switch (tool) {
    case 'status_projeto':
      return [
        'O que mudou neste projeto esta semana?',
        'Criar uma tarefa aqui',
      ]
    case 'andamento_de_projeto':
      return [
        ...(ehAdmin(role) ? ['Quem não apontou nesta semana?'] : []),
        'Tarefas travadas',
      ]
    case 'gerar_relatorio':
      return [
        'Gera em PDF também',
        'E do mês passado?',
      ]
    case 'agenda_do_periodo':
      return [
        'Quem está de férias nesta semana?',
        ...(ehAprovador(role) ? ['Quais apontamentos estão abertos?'] : []),
      ]
    case 'aprovacoes_pendentes':
      return []
    case 'meus_bonus':
      return [
        'E do mês passado?',
        ...(ehAdmin(role) ? ['Lançar um bônus pra alguém'] : []),
      ]
    case 'bonus_do_periodo':
      return ehAdmin(role) ? ['Lançar um bônus', 'Editar o da Ana'] : []
    case 'despesas_do_periodo':
      return ehAprovador(role) ? ['Quem tem despesa pendente?'] : []
    case 'tasks_travadas':
      return [
        'Mudar o status da mais antiga',
        'Comentar nela',
      ]
    default:
      return []
  }
}

export function sugerirProximos({ profile, context, lastTools, lastKind, ultimaMensagemUsuario } = {}) {
  if (lastKind === 'proposal') return []

  const role = profile?.role
  const out = []
  const visto = new Set()
  const ultima = norm(ultimaMensagemUsuario)

  function add(s) {
    if (!s || out.length >= 3) return
    const n = norm(s)
    if (!n || n === ultima || visto.has(n)) return
    visto.add(n)
    out.push(s)
  }

  add(ancora(context))

  const tools = Array.isArray(lastTools) ? lastTools : []
  const ultimaTool = tools.length ? tools[tools.length - 1] : null
  if (ultimaTool) {
    for (const s of daUltimaTool(ultimaTool, role)) add(s)
  }

  for (const s of aberturaDoPapel(role).chips) add(s)
  return out
}
