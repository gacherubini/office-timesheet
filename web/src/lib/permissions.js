export const ROLES = {
  ADMIN: 'admin',
  EMPLOYEE: 'employee',
  ADMINISTRATIVE_INTERN: 'administrative_intern',
}

export function isAdminRole(role) {
  return role === ROLES.ADMIN
}

export function isAdministrativeInternRole(role) {
  return role === ROLES.ADMINISTRATIVE_INTERN
}

export function canApproveRequestsRole(role) {
  return isAdminRole(role) || isAdministrativeInternRole(role)
}

export function canAccessMoneyRole(role) {
  return isAdminRole(role)
}

export function roleLabel(role) {
  if (role === ROLES.ADMIN) return 'Administrador'
  if (role === ROLES.ADMINISTRATIVE_INTERN) return 'Estagiário Administrativo'
  return 'Colaborador'
}
