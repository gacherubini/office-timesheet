import { isAdmin } from './permissions.js'

// Visibilidade POR INFORMAÇÃO (item 6 do PDF de ajustes de 18/08/2026).
//
// UM ÚNICO PONTO DE APLICAÇÃO, de propósito. A tentação é filtrar em cada rota,
// e foi assim que o vazamento de c0d3f06 aconteceu: o autor de GET /projects
// não estava pensando em admin_only, e nada o obrigava a pensar. Trocar um
// booleano por uma matriz de campos multiplica as chances do mesmo erro.
//
// Funções PURAS: recebem os campos restritos já carregados, não vão ao banco.
// Mesmo precedente de lib/birthdays.js e lib/performanceSimulation.js.

// Só estes podem ser marcados como restritos. `name` fica DE FORA: é o nome de
// exibição, lido por GET /projects, pela tool statusProjeto.js do agente e
// pelos relatórios. Restringi-lo apagaria cards de projeto e quebraria telas
// que nada têm a ver com PII.
export const CAMPOS_RESTRINGIVEIS = new Set([
  'cpf', 'rg', 'birth_date',
  'cnpj', 'inscricao_estadual', 'razao_social', 'founded_date',
  'bank_name', 'bank_agency', 'bank_account', 'bank_account_type', 'pix_key',
  'notes',
])

// "Nascem restritos por padrão: CPF, CNPJ, RG, dados bancários e valores de
// contrato." Valores de contrato já estão resolvidos: projects.sale_value não é
// devolvido por GET /projects e canAccessMoney() já é isAdmin.
export const PADRAO_RESTRITO = [
  'cpf', 'rg', 'cnpj',
  'bank_name', 'bank_agency', 'bank_account', 'bank_account_type', 'pix_key',
]

export function aplicarVisibilidade(profile, pessoa, restritos) {
  if (!pessoa) return pessoa
  if (isAdmin(profile)) return pessoa

  const remover = (restritos || []).filter((c) => CAMPOS_RESTRINGIVEIS.has(c))
  if (remover.length === 0) return pessoa

  // Cópia: o chamador pode estar reusando o objeto (cache, log, outra resposta).
  const copia = { ...pessoa }
  // DELETE, não `= null`: o PDF é literal — "nem mascarado, nem com aviso". Um
  // null renderizaria "CPF: —" na tela, que é justamente o aviso proibido.
  for (const campo of remover) delete copia[campo]
  return copia
}

export function aplicarVisibilidadeEmLista(profile, pessoas, restritosPorId) {
  const lista = Array.isArray(pessoas) ? pessoas : []
  if (isAdmin(profile)) return lista
  return lista.map((p) => aplicarVisibilidade(profile, p, restritosPorId?.[p.id]))
}

// Contatos e anexos são linhas: a restrição vive na própria linha, e o filtro é
// remover a linha inteira.
export function filtrarLinhasRestritas(profile, linhas) {
  const lista = Array.isArray(linhas) ? linhas : []
  if (isAdmin(profile)) return lista

  const visiveis = lista.filter((l) => !l.is_restricted)
  // Se o principal era restrito, quem não o vê ficaria com uma lista sem
  // principal — e a UI mostraria "sem telefone" tendo telefone. O próximo
  // assume o papel NA VISÃO DELE; no banco nada muda.
  if (visiveis.length > 0 && !visiveis.some((l) => l.is_primary)) {
    return visiveis.map((l, i) => (i === 0 ? { ...l, is_primary: true } : l))
  }
  return visiveis
}
