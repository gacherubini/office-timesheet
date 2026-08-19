// Traduz papel em predicado de linha e em lista de coluna. NÃO redefine papel
// (isso é do permissions.js); só recorta. Hoje conhece só `users` e é usado só
// pelo listar_equipe — as demais tools montam o próprio SELECT e quem verifica o
// recorte delas é o paridadeColuna.test.js. Ver §3.1 do design da Fase 1.
import { canAccessMoney, canAccessOperations } from '../permissions.js'

// Colunas de `users` que o GET /users devolve a quem tem acesso a dinheiro.
// admission_date/termination_date não são dado financeiro (tela de Pessoas
// mostra pra quem tem acesso operacional, dinheiro ou não).
const USERS_BASE = [
  'id', 'name', 'email', 'role',
  'is_active', 'position', 'birth_date', 'admission_date', 'termination_date',
  'phone', 'avatar_url', 'created_at',
]
const USERS_MONEY = ['hourly_rate', 'fixed_salary']

// Ordem espelha o SELECT do GET /users (users.js:142-144): as de dinheiro logo
// após `role`, para o teste de paridade comparar chaves sem depender de ordem.
const USERS_ADMIN = ['id', 'name', 'email', 'role', ...USERS_MONEY,
  'is_active', 'position', 'birth_date', 'admission_date', 'termination_date',
  'phone', 'avatar_url', 'created_at']

const ENTIDADES = new Set(['users'])

function assertEntidade(entidade) {
  if (!ENTIDADES.has(entidade)) {
    throw new Error(`entidade fora da allowlist do scope: ${entidade}`)
  }
}

export function colunasVisiveis(profile, entidade) {
  assertEntidade(entidade)
  if (entidade === 'users') {
    if (!canAccessOperations(profile)) return []
    return canAccessMoney(profile) ? [...USERS_ADMIN] : [...USERS_BASE]
  }
  return []
}

export function linhasVisiveis(profile, entidade) {
  assertEntidade(entidade)
  if (entidade === 'users') {
    return canAccessOperations(profile)
      ? { where: 'deleted_at IS NULL', params: [] }
      : { where: 'false', params: [] }
  }
  return { where: 'false', params: [] }
}
