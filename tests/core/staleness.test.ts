import { describe, it, expect, vi, afterEach } from 'vitest'
import { createTracker } from '../../src/core/tracker.js'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('price staleness warning', () => {
  it('warns when bundled prices are older than warnIfStaleAfterHours', () => {
    vi.useFakeTimers()
    // Set system time far in the future so the bundled prices appear stale
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z').getTime())

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const tracker = createTracker({ syncPrices: false, warnIfStaleAfterHours: 72 })
    // Trigger price resolution (lazily checked on first track call)
    tracker.track({ model: 'gpt-4o', inputTokens: 100, outputTokens: 50 })

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('[tokenwatch] Price data is'),
    )
  })

  it('does not warn when warnIfStaleAfterHours is 0 (disabled)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z').getTime())

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const tracker = createTracker({ syncPrices: false, warnIfStaleAfterHours: 0 })
    tracker.track({ model: 'gpt-4o', inputTokens: 100, outputTokens: 50 })

    const staleCalls = warn.mock.calls.filter((c) =>
      typeof c[0] === 'string' && c[0].includes('Price data is'),
    )
    expect(staleCalls).toHaveLength(0)
  })

  it('warns only once per tracker instance', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z').getTime())

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const tracker = createTracker({ syncPrices: false, warnIfStaleAfterHours: 72 })
    tracker.track({ model: 'gpt-4o', inputTokens: 100, outputTokens: 50 })
    tracker.track({ model: 'gpt-4o', inputTokens: 100, outputTokens: 50 })
    tracker.track({ model: 'gpt-4o', inputTokens: 100, outputTokens: 50 })

    const staleCalls = warn.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('Price data is'),
    )
    expect(staleCalls).toHaveLength(1)
  })

  it('includes pricesUpdatedAt in the report', async () => {
    const tracker = createTracker({ syncPrices: false })
    tracker.track({ model: 'gpt-4o', inputTokens: 100, outputTokens: 50 })
    const report = await tracker.getReport()
    // pricesUpdatedAt should be set (from bundled prices.json)
    expect(report.pricesUpdatedAt).toBeDefined()
    expect(typeof report.pricesUpdatedAt).toBe('string')
  })
})
