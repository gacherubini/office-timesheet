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

export function canAccessAdminArea(profile) {
  return isAdmin(profile) || isAdministrativeIntern(profile)
}

export function canManageClients(profile) {
  return Boolean(profile)
}

export function canDeleteClients(profile) {
  return canAccessOperations(profile)
}

export function canManageSuppliers(profile) {
  return Boolean(profile)
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
  return 'Colaborador'
}
