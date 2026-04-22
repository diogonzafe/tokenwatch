import { describe, it, expect, vi, afterEach } from 'vitest'
import { createTracker } from '../../src/core/tracker.js'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function makeTracker() {
  return createTracker({ syncPrices: false })
}

describe('getReport() with ReportOptions', () => {
  it('returns all entries when no options passed', async () => {
    vi.useFakeTimers()
    const tracker = makeTracker()

    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 0 })

    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'))
    tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 0 })

    const report = await tracker.getReport()
    expect(report.totalCostUSD).toBeGreaterThan(0)
    expect(report.byModel['gpt-4o']?.calls).toBe(2)
  })

  it('filters by since (ISO string)', async () => {
    vi.useFakeTimers()
    const tracker = makeTracker()

    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 0 })

    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'))
    tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 0 })

    const report = await tracker.getReport({ since: '2026-03-01T00:00:00.000Z' })
    expect(report.byModel['gpt-4o']?.calls).toBe(1)
  })

  it('filters by until (ISO string)', async () => {
    vi.useFakeTimers()
    const tracker = makeTracker()

    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 0 })

    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'))
    tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 0 })

    const report = await tracker.getReport({ until: '2026-03-01T00:00:00.000Z' })
    expect(report.byModel['gpt-4o']?.calls).toBe(1)
  })

  it('filters by since and until together', async () => {
    vi.useFakeTimers()
    const tracker = makeTracker()

    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 0 })

    vi.setSystemTime(new Date('2026-04-15T00:00:00.000Z'))
    tracker.track({ model: 'gpt-4o-mini', inputTokens: 1000, outputTokens: 0 })

    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'))
    tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 0 })

    const report = await tracker.getReport({
      since: '2026-03-01T00:00:00.000Z',
      until: '2026-05-01T00:00:00.000Z',
    })
    expect(Object.keys(report.byModel)).toHaveLength(1)
    expect(report.byModel['gpt-4o-mini']).toBeDefined()
  })

  it('filters by last "24h"', async () => {
    vi.useFakeTimers()
    const tracker = makeTracker()

    vi.setSystemTime(new Date('2026-04-20T00:00:00.000Z')) // 2+ days ago
    tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 0 })

    vi.setSystemTime(new Date('2026-04-22T06:00:00.000Z')) // 6h ago
    tracker.track({ model: 'gpt-4o-mini', inputTokens: 1000, outputTokens: 0 })

    vi.setSystemTime(new Date('2026-04-22T12:00:00.000Z')) // now

    const report = await tracker.getReport({ last: '24h' })
    expect(report.byModel['gpt-4o']).toBeUndefined()
    expect(report.byModel['gpt-4o-mini']).toBeDefined()
  })

  it('filters by last "7d"', async () => {
    vi.useFakeTimers()
    const tracker = makeTracker()

    vi.setSystemTime(new Date('2026-04-10T00:00:00.000Z')) // 12 days ago
    tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 0 })

    vi.setSystemTime(new Date('2026-04-18T00:00:00.000Z')) // 4 days ago
    tracker.track({ model: 'gpt-4o-mini', inputTokens: 1000, outputTokens: 0 })

    vi.setSystemTime(new Date('2026-04-22T12:00:00.000Z')) // now

    const report = await tracker.getReport({ last: '7d' })
    expect(report.byModel['gpt-4o']).toBeUndefined()
    expect(report.byModel['gpt-4o-mini']).toBeDefined()
  })

  it('returns empty report for range with no entries', async () => {
    vi.useFakeTimers()
    const tracker = makeTracker()

    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 0 })

    vi.setSystemTime(new Date('2026-04-22T12:00:00.000Z'))

    const report = await tracker.getReport({ since: '2026-06-01T00:00:00.000Z' })
    expect(report.totalCostUSD).toBe(0)
    expect(Object.keys(report.byModel)).toHaveLength(0)
  })

  it('throws on invalid last value', async () => {
    const tracker = makeTracker()
    await expect(tracker.getReport({ last: 'invalid' })).rejects.toThrow('Invalid "last" value')
  })

  it('last takes precedence over since when both provided', async () => {
    vi.useFakeTimers()
    const tracker = makeTracker()

    vi.setSystemTime(new Date('2026-04-22T06:00:00.000Z')) // 6h ago
    tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 0 })

    vi.setSystemTime(new Date('2026-04-22T12:00:00.000Z')) // now

    // last='1h' — entry at 6h ago should be excluded even though since is far in the past
    const report = await tracker.getReport({ last: '1h', since: '2026-01-01T00:00:00.000Z' })
    expect(report.totalCostUSD).toBe(0)
  })
})
