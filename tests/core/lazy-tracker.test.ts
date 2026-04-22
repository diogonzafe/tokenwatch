import { describe, it, expect } from 'vitest'
import { createLazyTracker } from '../../src/core/lazy-tracker.js'
import type { Tracker } from '../../src/types/index.js'

const CSV_HEADER =
  'timestamp,model,inputTokens,outputTokens,reasoningTokens,cachedTokens,cacheCreationTokens,costUSD,sessionId,userId,feature'

describe('createLazyTracker() — before init()', () => {
  it('track() before init() does not throw, and getReport() shows zero cost', async () => {
    const lazy = createLazyTracker()
    expect(() => lazy.track({ model: 'gpt-4o', inputTokens: 100, outputTokens: 50 })).not.toThrow()
    const report = await lazy.getReport()
    expect(report.totalCostUSD).toBe(0)
  })

  it('getReport() returns the correct zero-report shape', async () => {
    const lazy = createLazyTracker()
    const report = await lazy.getReport()
    expect(report.totalCostUSD).toBe(0)
    expect(report.totalTokens).toEqual({ input: 0, output: 0 })
    expect(report.byModel).toEqual({})
    expect(report.bySession).toEqual({})
    expect(report.byUser).toEqual({})
    expect(report.byFeature).toEqual({})
    expect(typeof report.period.from).toBe('string')
    expect(typeof report.period.to).toBe('string')
  })

  it('getCostForecast() returns zero forecast with basedOnPeriod: null', async () => {
    const lazy = createLazyTracker()
    const forecast = await lazy.getCostForecast()
    expect(forecast.burnRatePerHour).toBe(0)
    expect(forecast.projectedDailyCostUSD).toBe(0)
    expect(forecast.projectedMonthlyCostUSD).toBe(0)
    expect(forecast.basedOnHours).toBe(0)
    expect(forecast.basedOnPeriod).toBeNull()
  })

  it('exportJSON() returns valid JSON string', async () => {
    const lazy = createLazyTracker()
    const json = await lazy.exportJSON()
    expect(() => JSON.parse(json)).not.toThrow()
  })

  it('exportCSV() returns only the header row (no data rows)', async () => {
    const lazy = createLazyTracker()
    const csv = await lazy.exportCSV()
    expect(csv).toBe(CSV_HEADER)
  })

  it('getModelInfo() returns null', () => {
    const lazy = createLazyTracker()
    expect(lazy.getModelInfo('gpt-4o')).toBeNull()
  })

  it('reset() before init() resolves without throwing', async () => {
    const lazy = createLazyTracker()
    await expect(lazy.reset()).resolves.toBeUndefined()
  })

  it('resetSession() before init() resolves without throwing', async () => {
    const lazy = createLazyTracker()
    await expect(lazy.resetSession('sess-123')).resolves.toBeUndefined()
  })
})

describe('createLazyTracker() — after init()', () => {
  it('track() + getReport() works correctly after init()', async () => {
    const lazy = createLazyTracker()
    lazy.init({
      syncPrices: false,
      customPrices: { 'gpt-4o': { input: 2.5, output: 10 } },
    })
    lazy.track({ model: 'gpt-4o', inputTokens: 1_000_000, outputTokens: 0 })
    const report = await lazy.getReport()
    expect(report.totalCostUSD).toBeCloseTo(2.5, 5)
    expect(report.byModel['gpt-4o']?.calls).toBe(1)
  })

  it('reset() after init() clears all entries', async () => {
    const lazy = createLazyTracker()
    lazy.init({
      syncPrices: false,
      customPrices: { 'gpt-4o': { input: 2.5, output: 10 } },
    })
    lazy.track({ model: 'gpt-4o', inputTokens: 1_000_000, outputTokens: 0 })
    await lazy.reset()
    const report = await lazy.getReport()
    expect(report.totalCostUSD).toBe(0)
    expect(Object.keys(report.byModel)).toHaveLength(0)
  })

  it('getModelInfo() returns price data after init()', () => {
    const lazy = createLazyTracker()
    lazy.init({
      syncPrices: false,
      customPrices: { 'gpt-4o': { input: 2.5, output: 10 } },
    })
    const info = lazy.getModelInfo('gpt-4o')
    expect(info).not.toBeNull()
    expect(info?.input).toBe(2.5)
  })
})

describe('createLazyTracker() — init() guard', () => {
  it('calling init() a second time throws', () => {
    const lazy = createLazyTracker()
    lazy.init({ syncPrices: false })
    expect(() => lazy.init({ syncPrices: false })).toThrow('already initialized')
  })

  it('a failed init() (invalid config) leaves tracker in no-op mode', async () => {
    const lazy = createLazyTracker()
    expect(() =>
      lazy.init({ alertThreshold: -1 } as never),
    ).toThrow()
    // Should still be in no-op mode — no throw
    expect(() => lazy.track({ model: 'gpt-4o', inputTokens: 100, outputTokens: 50 })).not.toThrow()
    const report = await lazy.getReport()
    expect(report.totalCostUSD).toBe(0)
  })

  it('LazyTracker is structurally compatible with Tracker', () => {
    // TypeScript structural check — if this compiles, the interface is satisfied
    const lazy = createLazyTracker()
    const _t: Tracker = lazy
    expect(_t).toBeDefined()
  })
})
