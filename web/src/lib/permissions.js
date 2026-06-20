export const ROLES = {
  ADMIN: 'admin',
  EMPLOYEE: 'employee',
  ADMINISTRATIVE_INTERN: 'administrative_intern',
  PROJECT_MANAGER: 'project_manager',
}

export function isAdminRole(role) {
  return role === ROLES.ADMIN
}

export function isAdministrativeInternRole(role) {
  return role === ROLES.ADMINISTRATIVE_INTERN
}

export function isProjectManagerRole(role) {
  return role === ROLES.PROJECT_MANAGER
}

// Gestão de projetos e templates: admin + Gestor de Projetos.
export function canManageProjectsRole(role) {
  return isAdminRole(role) || isProjectManagerRole(role)
}

export function canApproveRequestsRole(role) {
  return isAdminRole(role) || isAdministrativeInternRole(role)
}

export function canAccessAdminAreaRole(role) {
  return isAdminRole(role) || isAdministrativeInternRole(role)
}

export function canAccessMoneyRole(role) {
  return isAdminRole(role)
}

export function canManageClientsRole(role) {
  return Boolean(role)
}

export function canDeleteClientsRole(role) {
  return canAccessAdminAreaRole(role)
}

export function canManageSuppliersRole(role) {
  return Boolean(role)
}

export function canDeleteSuppliersRole(role) {
  return canAccessAdminAreaRole(role)
}

export function canAutoApproveOwnVacationRequestRole(role) {
  return isAdminRole(role)
}

export function canApproveVacationRequestRole(role, requesterRole) {
  if (!canApproveRequestsRole(role)) return false
  if (isAdministrativeInternRole(requesterRole)) return isAdminRole(role)
  return true
}

export function roleLabel(role) {
  if (role === ROLES.ADMIN) return 'Administrador'
  if (role === ROLES.ADMINISTRATIVE_INTERN) return 'Estagiário Administrativo'
  if (role === ROLES.PROJECT_MANAGER) return 'Gestor de Projetos'
  return 'Colaborador'
}
