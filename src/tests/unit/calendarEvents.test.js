import { describe, it, expect, vi } from 'vitest'

describe('lib/calendar/events — API extraída', () => {
  it('exporta isValidIcsUrl, isPrivateOrReservedIp, listEventsForUser, isCalendarConnected', async () => {
    const mod = await import('../../lib/calendar/events.js')
    expect(typeof mod.isValidIcsUrl).toBe('function')
    expect(typeof mod.isPrivateOrReservedIp).toBe('function')
    expect(typeof mod.listEventsForUser).toBe('function')
    expect(typeof mod.isCalendarConnected).toBe('function')
  })

  it('isValidIcsUrl continua rejeitando host arbitrário (mesmo contrato da rota)', async () => {
    const { isValidIcsUrl } = await import('../../lib/calendar/events.js')
    expect(isValidIcsUrl('https://evil.example.com/steal.ics')).toBe(false)
    expect(isValidIcsUrl('https://calendar.google.com/calendar/ical/x/basic.ics')).toBe(true)
  })
})
