import { describe, it, expect } from 'vitest'
import { isValidIcsUrl, isPrivateOrReservedIp } from '../../routes/calendar.js'

describe('calendário — anti-SSRF', () => {
  it('aceita hosts Google https', () => {
    expect(
      isValidIcsUrl('https://calendar.google.com/calendar/ical/foo%40bar.com/private-xxx/basic.ics'),
    ).toBe(true)
    expect(isValidIcsUrl('https://www.google.com/calendar/ical/x/basic.ics')).toBe(true)
  })

  it('rejeita escape antigo por .ics em host arbitrário', () => {
    expect(isValidIcsUrl('https://169.254.169.254/latest/meta-data.ics')).toBe(false)
    expect(isValidIcsUrl('https://evil.example.com/steal.ics')).toBe(false)
    expect(isValidIcsUrl('https://127.0.0.1/calendar.ics')).toBe(false)
    expect(isValidIcsUrl('http://calendar.google.com/x.ics')).toBe(false)
  })

  it('classifica IPs privados/metadata', () => {
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true)
    expect(isPrivateOrReservedIp('10.0.0.5')).toBe(true)
    expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true)
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true)
    expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true)
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false)
    expect(isPrivateOrReservedIp('::1')).toBe(true)
  })
})
