import { describe, it, expect, vi, afterEach } from 'vitest'
import { createTracker } from '../../src/core/tracker.js'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function makeTracker() {
  return createTracker({ syncPrices: false })
}

describe('getCostForecast()', () => {
  it('returns zero forecast when no entries exist', async () => {
    const tracker = makeTracker()
    const forecast = await tracker.getCostForecast()
    expect(forecast.burnRatePerHour).toBe(0)
    expect(forecast.projectedDailyCostUSD).toBe(0)
    expect(forecast.projectedMonthlyCostUSD).toBe(0)
    expect(forecast.basedOnHours).toBe(0)
    expect(forecast.basedOnPeriod).toBeNull()
  })

  it('returns zero forecast with only 1 entry', async () => {
    const tracker = makeTracker()
    tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 500 })
    const forecast = await tracker.getCostForecast()
    expect(forecast.burnRatePerHour).toBe(0)
    expect(forecast.basedOnHours).toBe(0)
  })

  it('computes burn rate from two entries 1 hour apart', async () => {
    vi.useFakeTimers()
    const base = new Date('2026-04-22T10:00:00.000Z').getTime()
    const tracker = makeTracker()

    // First entry at T=0
    vi.setSystemTime(base)
    tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 500 })

    // Second entry at T+1h
    vi.setSystemTime(base + 60 * 60 * 1000)
    tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 500 })

    // Forecast from T+1h
    const forecast = await tracker.getCostForecast({ windowHours: 24 })
    expect(forecast.burnRatePerHour).toBeGreaterThan(0)
    expect(forecast.projectedDailyCostUSD).toBeCloseTo(forecast.burnRatePerHour * 24, 5)
    expect(forecast.projectedMonthlyCostUSD).toBeCloseTo(forecast.burnRatePerHour * 24 * 30, 5)
    expect(forecast.basedOnPeriod).not.toBeNull()
  })

  it('excludes entries outside the window', async () => {
    vi.useFakeTimers()
    const base = new Date('2026-04-22T12:00:00.000Z').getTime()
    const tracker = makeTracker()

    // Old expensive entry 25h ago — should be excluded from default 24h window
    vi.setSystemTime(base - 25 * 60 * 60 * 1000)
    tracker.track({ model: 'gpt-4o', inputTokens: 10_000_000, outputTokens: 5_000_000 }) // $100

    // Recent cheap entries
    vi.setSystemTime(base - 30 * 60 * 1000) // 30 min ago
    tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 500 })

    vi.setSystemTime(base) // now
    tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 500 })

    const forecast = await tracker.getCostForecast()
    // Only the 2 recent cheap entries should be in the window
    expect(forecast.burnRatePerHour).toBeLessThan(1)
  })

  it('respects custom windowHours', async () => {
    vi.useFakeTimers()
    const base = new Date('2026-04-22T12:00:00.000Z').getTime()
    const tracker = makeTracker()

    // Entry 2h ago — within 24h but outside 1h window
    vi.setSystemTime(base - 2 * 60 * 60 * 1000)
    tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 500 })

    vi.setSystemTime(base)
    // Only 1 entry within 1h window → returns zero
    const forecast = await tracker.getCostForecast({ windowHours: 1 })
    expect(forecast.burnRatePerHour).toBe(0)
    expect(forecast.basedOnHours).toBe(0)
  })
})
