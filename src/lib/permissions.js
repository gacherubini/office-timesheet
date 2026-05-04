export const ROLES = {
  ADMIN: 'admin',
  EMPLOYEE: 'employee',
  ADMINISTRATIVE_INTERN: 'administrative_intern',
}

export const VALID_ROLES = Object.values(ROLES)

export function isAdmin(profile) {
  return profile?.role === ROLES.ADMIN
}

export function isAdministrativeIntern(profile) {
  return profile?.role === ROLES.ADMINISTRATIVE_INTERN
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

export function roleLabel(role) {
  if (role === ROLES.ADMIN) return 'Administrador'
  if (role === ROLES.ADMINISTRATIVE_INTERN) return 'Estagiário Administrativo'
  return 'Colaborador'
}
