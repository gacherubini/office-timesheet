// Presença ao vivo: quem deu sinal nos últimos minutos. Alimenta o indicador
// "usuários online" da home do admin (GET /admin/dashboard).
//
// Por que memória e não coluna em users: requireAuth faz ZERO queries em cache
// hit — é exatamente o motivo de lib/userCache.js existir. Um UPDATE por
// request pegaria lock de linha na tabela mais lida do sistema para alimentar
// um número na tela. Ver §3 de docs/superpowers/specs/2026-08-18-ajustes-void-visao-geral.md.
//
// Ressalva de escala (a mesma que o userCache.js já carrega): com mais de uma
// máquina no Fly, cada instância teria seu próprio Map e o número sairia MENOR
// que o real. Hoje min_machines_running = 1 e auto_stop_machines = off. Se um
// dia escalar, isto vira tabela — e o userCache também.
//
// Custo aceito: zera no deploy e repopula em segundos, conforme as pessoas
// fazem requests. Não há histórico e não deve haver.
//
// NOME: "onlineUsers" e não "presence" porque routes/presences.js e a tabela
// `presences` (migration 028) são OUTRA COISA — a marcação de "vou ao
// escritório amanhã" da Agenda. Dois conceitos quase homônimos no mesmo repo
// seria armadilha para quem chegar depois.

// Lido em call-time de propósito, para o teste poder encurtar a janela sem
// depender da ordem de import (mesmo padrão do serveDisabled() no userCache).
function janelaMs() {
  return Number(process.env.PRESENCE_WINDOW_MS) || 5 * 60_000
}

const vistos = new Map() // userId -> epoch ms do último sinal

export function marcarVisto(userId) {
  if (userId) vistos.set(userId, Date.now())
}

// Poda preguiçosa: remove os vencidos no mesmo passo em que monta o resultado.
// Com dezenas de usuários não compensa um timer, e sem a poda o Map cresceria
// para sempre num processo de vida longa.
export function usuariosOnline() {
  const limite = Date.now() - janelaMs()
  const ativos = new Set()
  for (const [userId, visto] of vistos) {
    if (visto > limite) ativos.add(userId)
    else vistos.delete(userId)
  }
  return ativos
}

// Reset entre testes (ver tests/helpers/db.js), espelhando clearUserCache().
export function limparOnline() {
  vistos.clear()
}
