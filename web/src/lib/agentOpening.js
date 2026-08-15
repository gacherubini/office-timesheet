// Chips de abertura por papel (§6.7).
// Cópia do servidor — Vite não importa src/. espelho; mudar nos dois (src/lib/agent/opening.js).

const POR_PAPEL = {
  admin: {
    subtitulo: 'Posso cruzar horas, custo e pendências — ou gerar um arquivo. Toda alteração passa por você.',
    chips: [
      'Quem não apontou esta semana?',
      'Lançar um bônus',
      'Quais aprovações estão pendentes?',
    ],
  },
  administrative_intern: {
    subtitulo: 'Posso te ajudar com aprovações e o dia a dia da equipe. Toda alteração passa por você.',
    chips: [
      'O que está pendente de aprovação?',
      'Quem está apontando agora?',
      'Quem está de férias esta semana?',
    ],
  },
  project_manager: {
    subtitulo: 'Posso olhar projetos, tarefas e o andamento do time. Toda alteração passa por você.',
    chips: [
      'Quais projetos estão ativos?',
      'Tarefas travadas em revisão?',
      'Quais foram meus bônus?',
    ],
  },
  employee: {
    subtitulo: 'Posso consultar seus apontamentos, tarefas, bônus e pedir férias. Toda alteração passa por você.',
    chips: [
      'Quantas horas lancei este mês?',
      'Quais foram meus bônus?',
      'Quero pedir férias',
    ],
  },
}

export function aberturaDoPapel(role, contexto) {
  const a = POR_PAPEL[role] || POR_PAPEL.employee
  const chips = [...a.chips]
  const nome = contexto?.projectName
  if (nome) chips[0] = `Como está o ${nome}?`
  return { subtitulo: a.subtitulo, chips }
}
