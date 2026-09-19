import { describe, expect, it } from 'vitest'
import { formatMoney, localDateInput } from './format'

describe('formatMoney', () => {
  it('formats configured GBP prices', () => {
    expect(formatMoney(12500)).toBe('£125')
  })

  it('does not invent an unconfigured price', () => {
    expect(formatMoney(null)).toBe('Price on request')
  })
})

describe('localDateInput', () => {
  it('returns an ISO-compatible calendar date', () => {
    expect(localDateInput(new Date('2026-09-14T12:00:00Z'))).toMatch(/^2026-09-14$/)
  })
})
