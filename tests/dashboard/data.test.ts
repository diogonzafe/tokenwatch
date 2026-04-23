import { describe, it, expect } from 'vitest'
import { parseSince, buildTimeSeries, getFingerprint, getDashboardData } from '../../src/dashboard/data.js'
import type { UsageEntry } from '../../src/types/index.js'

function makeEntry(overrides: Partial<UsageEntry> = {}): UsageEntry {
  return {
    model: 'gpt-4o',
    inputTokens: 100,
    outputTokens: 50,
    costUSD: 0.001,
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

describe('parseSince', () => {
  it('returns a timestamp ~1h ago for "1h"', () => {
    const now = Date.now()
    const result = parseSince('1h')
    expect(result).toBeDefined()
    expect(result!).toBeGreaterThan(now - 60 * 60 * 1000 - 100)
    expect(result!).toBeLessThanOrEqual(now)
  })

  it('returns a timestamp ~24h ago for "24h"', () => {
    const now = Date.now()
    const result = parseSince('24h')
    expect(result).toBeDefined()
    expect(result!).toBeGreaterThan(now - 24 * 60 * 60 * 1000 - 100)
    expect(result!).toBeLessThanOrEqual(now)
  })

  it('returns a timestamp ~7d ago for "7d"', () => {
    const now = Date.now()
    const result = parseSince('7d')
    expect(result).toBeDefined()
    expect(result!).toBeGreaterThan(now - 7 * 24 * 60 * 60 * 1000 - 100)
    expect(result!).toBeLessThanOrEqual(now)
  })

  it('returns a timestamp ~30d ago for "30d"', () => {
    const now = Date.now()
    const result = parseSince('30d')
    expect(result).toBeDefined()
    expect(result!).toBeGreaterThan(now - 30 * 24 * 60 * 60 * 1000 - 100)
    expect(result!).toBeLessThanOrEqual(now)
  })

  it('returns undefined for "all"', () => {
    expect(parseSince('all')).toBeUndefined()
  })

  it('returns undefined for undefined', () => {
    expect(parseSince(undefined)).toBeUndefined()
  })

  it('returns undefined for unknown filter', () => {
    expect(parseSince('invalid')).toBeUndefined()
  })
})

describe('buildTimeSeries', () => {
  it('uses 5-min buckets for 1h window', () => {
    const now = Date.now()
    const sinceMs = now - 60 * 60 * 1000 // 1h ago
    // Two entries 6 minutes apart → should be in different 5-min buckets
    const entries: UsageEntry[] = [
      makeEntry({ timestamp: new Date(now - 50 * 60 * 1000).toISOString(), costUSD: 0.001 }),
      makeEntry({ timestamp: new Date(now - 44 * 60 * 1000).toISOString(), costUSD: 0.002 }),
    ]
    const result = buildTimeSeries(entries, sinceMs)
    expect(result.length).toBeGreaterThanOrEqual(2) // at least 2 distinct 5-min buckets
  })

  it('uses 1h buckets for 24h window', () => {
    const now = Date.now()
    const sinceMs = now - 24 * 60 * 60 * 1000 // 24h ago
    // Two entries 2 hours apart → must be in different 1h buckets
    const entries: UsageEntry[] = [
      makeEntry({ timestamp: new Date(now - 10 * 60 * 60 * 1000).toISOString(), costUSD: 0.001 }),
      makeEntry({ timestamp: new Date(now - 8 * 60 * 60 * 1000).toISOString(), costUSD: 0.002 }),
    ]
    const result = buildTimeSeries(entries, sinceMs)
    expect(result.length).toBe(2)
  })

  it('uses 1-day buckets for "all" (undefined since)', () => {
    // Two entries 2 days apart → must be in different day buckets
    const base = new Date('2026-01-01T12:00:00.000Z').getTime()
    const entries: UsageEntry[] = [
      makeEntry({ timestamp: new Date(base).toISOString(), costUSD: 0.001 }),
      makeEntry({ timestamp: new Date(base + 2 * 24 * 60 * 60 * 1000).toISOString(), costUSD: 0.002 }),
    ]
    const result = buildTimeSeries(entries, undefined)
    expect(result.length).toBe(2)
  })

  it('returns buckets sorted by bucket key ascending', () => {
    const base = new Date('2026-01-01T00:00:00.000Z').getTime()
    const entries: UsageEntry[] = [
      makeEntry({ timestamp: new Date(base + 3 * 24 * 60 * 60 * 1000).toISOString() }),
      makeEntry({ timestamp: new Date(base).toISOString() }),
      makeEntry({ timestamp: new Date(base + 1 * 24 * 60 * 60 * 1000).toISOString() }),
    ]
    const result = buildTimeSeries(entries, undefined)
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.bucket >= result[i - 1]!.bucket).toBe(true)
    }
  })

  it('aggregates entries in the same bucket', () => {
    const now = Date.now()
    const sinceMs = now - 24 * 60 * 60 * 1000
    // Two entries within the same 1h bucket
    const hourStart = Math.floor((now - 2 * 60 * 60 * 1000) / (60 * 60 * 1000)) * (60 * 60 * 1000)
    const entries: UsageEntry[] = [
      makeEntry({ timestamp: new Date(hourStart + 1000).toISOString(), costUSD: 0.001 }),
      makeEntry({ timestamp: new Date(hourStart + 2000).toISOString(), costUSD: 0.002 }),
    ]
    const result = buildTimeSeries(entries, sinceMs)
    expect(result.length).toBe(1)
    expect(result[0]!.cost).toBeCloseTo(0.003, 6)
    expect(result[0]!.calls).toBe(2)
  })

  it('excludes entries before sinceMs', () => {
    const now = Date.now()
    const sinceMs = now - 60 * 60 * 1000 // 1h ago
    const entries: UsageEntry[] = [
      makeEntry({ timestamp: new Date(now - 2 * 60 * 60 * 1000).toISOString(), costUSD: 0.005 }),
      makeEntry({ timestamp: new Date(now - 10 * 60 * 1000).toISOString(), costUSD: 0.001 }),
    ]
    const result = buildTimeSeries(entries, sinceMs)
    // Only the recent entry should appear
    const totalCost = result.reduce((s, b) => s + b.cost, 0)
    expect(totalCost).toBeCloseTo(0.001, 6)
  })
})

describe('getFingerprint', () => {
  it('returns a consistent string based on cost, tokens, and timeSeries length', async () => {
    const storage = {
      record: () => {},
      getAll: () => [],
      clearAll: () => {},
      clearSession: () => {},
    }
    const data = await getDashboardData(storage)
    const fp1 = getFingerprint(data)
    const fp2 = getFingerprint(data)
    expect(fp1).toBe(fp2)
    expect(fp1).toBe('0.00000000-0-0')
  })
})

describe('getDashboardData', () => {
  it('returns correct shape with empty storage', async () => {
    const storage = {
      record: () => {},
      getAll: () => [] as UsageEntry[],
      clearAll: () => {},
      clearSession: () => {},
    }
    const data = await getDashboardData(storage)
    expect(data.report.totalCostUSD).toBe(0)
    expect(data.report.totalTokens.input).toBe(0)
    expect(data.report.totalTokens.output).toBe(0)
    expect(data.report.byModel).toEqual({})
    expect(data.forecast.burnRatePerHour).toBe(0)
    expect(data.forecast.basedOnPeriod).toBeNull()
    expect(data.timeSeries).toEqual([])
    expect(typeof data.lastUpdated).toBe('string')
  })

  it('aggregates entries into report correctly', async () => {
    const now = new Date().toISOString()
    const storage = {
      record: () => {},
      getAll: (): UsageEntry[] => [
        makeEntry({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 500, costUSD: 0.01, timestamp: now }),
        makeEntry({ model: 'gpt-4o', inputTokens: 500, outputTokens: 250, costUSD: 0.005, timestamp: now }),
        makeEntry({ model: 'gpt-4o-mini', inputTokens: 200, outputTokens: 100, costUSD: 0.001, timestamp: now }),
      ],
      clearAll: () => {},
      clearSession: () => {},
    }
    const data = await getDashboardData(storage)
    expect(data.report.totalCostUSD).toBeCloseTo(0.016, 5)
    expect(data.report.byModel['gpt-4o']?.calls).toBe(2)
    expect(data.report.byModel['gpt-4o-mini']?.calls).toBe(1)
  })

  it('respects filter parameter to narrow report entries', async () => {
    const now = Date.now()
    const storage = {
      record: () => {},
      getAll: (): UsageEntry[] => [
        makeEntry({ costUSD: 0.1, timestamp: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString() }),
        makeEntry({ costUSD: 0.01, timestamp: new Date(now - 30 * 60 * 1000).toISOString() }),
      ],
      clearAll: () => {},
      clearSession: () => {},
    }
    const data = await getDashboardData(storage, '1h')
    // Only the recent entry should be in the report
    expect(data.report.totalCostUSD).toBeCloseTo(0.01, 5)
  })
})
