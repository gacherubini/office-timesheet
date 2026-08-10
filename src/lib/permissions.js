export const ROLES = {
  ADMIN: 'admin',
  EMPLOYEE: 'employee',
  ADMINISTRATIVE_INTERN: 'administrative_intern',
  PROJECT_MANAGER: 'project_manager',
}

export const VALID_ROLES = Object.values(ROLES)

export function isAdmin(profile) {
  return profile?.role === ROLES.ADMIN
}

export function isAdministrativeIntern(profile) {
  return profile?.role === ROLES.ADMINISTRATIVE_INTERN
}

export function isProjectManager(profile) {
  return profile?.role === ROLES.PROJECT_MANAGER
}

// Gestão de projetos e templates: admin + Gestor de Projetos.
export function canManageProjects(profile) {
  return isAdmin(profile) || isProjectManager(profile)
}

export function canApproveRequests(profile) {
  return isAdmin(profile) || isAdministrativeIntern(profile)
}

export function canAccessOperations(profile) {
  return isAdmin(profile) || isAdministrativeIntern(profile)
}

export function canAccessMoney(profile) {
  return isAdmin(profile)
}

export function canAccessAdminArea(profile) {
  return isAdmin(profile) || isAdministrativeIntern(profile)
}

// CRM (clientes/fornecedores com PII): GERIR (criar/editar/excluir) é só de
// operações (admin + intern). VER a lista é liberado a qualquer autenticado — o
// filtro admin_only nas rotas esconde os restritos dos não-admins, então o
// colaborador vê os contatos comuns e não vê os marcados como admin_only.
export function canViewClients(profile) {
  return Boolean(profile)
}

export function canViewSuppliers(profile) {
  return Boolean(profile)
}

export function canManageClients(profile) {
  return canAccessOperations(profile)
}

export function canDeleteClients(profile) {
  return canAccessOperations(profile)
}

export function canManageSuppliers(profile) {
  return canAccessOperations(profile)
}

export function canDeleteSuppliers(profile) {
  return canAccessOperations(profile)
}

export function canCreateOwnVacationRequest(profile) {
  return Boolean(profile)
}

export function canDeleteOwnVacationRequest(profile) {
  return Boolean(profile)
}

export function canAutoApproveOwnVacationRequest(profile) {
  return isAdmin(profile)
}

export function canViewVacationApprovals(profile) {
  return canApproveRequests(profile)
}

export function canApproveVacationRequest(profile, requesterProfile) {
  if (!canApproveRequests(profile)) return false
  if (isAdministrativeIntern(requesterProfile)) return isAdmin(profile)
  return true
}

export function roleLabel(role) {
  if (role === ROLES.ADMIN) return 'Administrador'
  if (role === ROLES.ADMINISTRATIVE_INTERN) return 'Estagiário Administrativo'
  if (role === ROLES.PROJECT_MANAGER) return 'Gestor de Projetos'
  return 'Colaborador'
}
