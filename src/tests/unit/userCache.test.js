import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getCachedProfile,
  setCachedProfile,
  getCachedUsersBasic,
  setCachedUsersBasic,
  invalidateUser,
  invalidateUsersBasic,
  clearUserCache,
} from '../../lib/userCache.js'

// Garante o kill-switch USER_CACHE_DISABLED desligado ao exercitar a lógica de
// serving, e restaura no fim (o último caso testa o kill-switch ligado).
describe('userCache', () => {
  const prevDisabled = process.env.USER_CACHE_DISABLED

  beforeEach(() => {
    delete process.env.USER_CACHE_DISABLED
    clearUserCache()
  })

  afterEach(() => {
    vi.useRealTimers()
    if (prevDisabled === undefined) delete process.env.USER_CACHE_DISABLED
    else process.env.USER_CACHE_DISABLED = prevDisabled
  })

  const profile = { id: 'u1', name: 'Ana', role: 'employee', is_active: true }

  it('set/get devolve o perfil cacheado', () => {
    expect(getCachedProfile('u1')).toBeNull()
    setCachedProfile('u1', profile)
    expect(getCachedProfile('u1')).toEqual(profile)
  })

  it('get devolve uma CÓPIA (mutar o retorno não corrompe o cache)', () => {
    setCachedProfile('u1', profile)
    const got = getCachedProfile('u1')
    got.role = 'admin'
    expect(getCachedProfile('u1').role).toBe('employee')
  })

  it('invalidateUser remove o perfil E zera a lista básica', () => {
    setCachedProfile('u1', profile)
    setCachedUsersBasic([{ id: 'u1' }])
    invalidateUser('u1')
    expect(getCachedProfile('u1')).toBeNull()
    expect(getCachedUsersBasic()).toBeNull()
  })

  it('invalidateUsersBasic zera só a lista, mantém o perfil', () => {
    setCachedProfile('u1', profile)
    setCachedUsersBasic([{ id: 'u1' }])
    invalidateUsersBasic()
    expect(getCachedUsersBasic()).toBeNull()
    expect(getCachedProfile('u1')).toEqual(profile)
  })

  it('expira após o TTL (60s padrão)', () => {
    vi.useFakeTimers()
    setCachedProfile('u1', profile)
    vi.advanceTimersByTime(59_000)
    expect(getCachedProfile('u1')).toEqual(profile) // dentro do TTL
    vi.advanceTimersByTime(2_000)
    expect(getCachedProfile('u1')).toBeNull() // 61s > 60s
  })

  it('clearUserCache limpa perfis e lista', () => {
    setCachedProfile('u1', profile)
    setCachedUsersBasic([{ id: 'u1' }])
    clearUserCache()
    expect(getCachedProfile('u1')).toBeNull()
    expect(getCachedUsersBasic()).toBeNull()
  })

  it('com USER_CACHE_DISABLED=1 os getters não servem nada (kill-switch)', () => {
    setCachedProfile('u1', profile)
    setCachedUsersBasic([{ id: 'u1' }])
    process.env.USER_CACHE_DISABLED = '1'
    expect(getCachedProfile('u1')).toBeNull()
    expect(getCachedUsersBasic()).toBeNull()
  })
})
