import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createTracker } from '../../src/core/tracker.js'
import type { Tracker } from '../../src/types/index.js'

// Disable remote price sync in all tests
function makeTracker(overrides = {}) {
  return createTracker({ syncPrices: false, ...overrides })
}

describe('createTracker', () => {
  it('creates a tracker with zero totals', async () => {
    const tracker = makeTracker()
    const report = await tracker.getReport()
    expect(report.totalCostUSD).toBe(0)
    expect(report.totalTokens).toEqual({ input: 0, output: 0 })
    expect(report.byModel).toEqual({})
    expect(report.bySession).toEqual({})
    expect(report.byUser).toEqual({})
  })

  it('accumulates cost by model', async () => {
    const tracker = makeTracker()
    tracker.track({ model: 'gpt-4o', inputTokens: 1_000_000, outputTokens: 0 })
    tracker.track({ model: 'gpt-4o', inputTokens: 0, outputTokens: 1_000_000 })
    const report = await tracker.getReport()
    // gpt-4o: $2.50/M input + $10/M output
    expect(report.totalCostUSD).toBeCloseTo(2.5 + 10.0)
    expect(report.byModel['gpt-4o']?.calls).toBe(2)
  })

  it('accumulates by session', async () => {
    const tracker = makeTracker()
    tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 500, sessionId: 'sess-1' })
    tracker.track({ model: 'gpt-4o', inputTokens: 2000, outputTokens: 1000, sessionId: 'sess-2' })
    tracker.track({ model: 'gpt-4o', inputTokens: 500, outputTokens: 200, sessionId: 'sess-1' })
    const report = await tracker.getReport()
    expect(report.bySession['sess-1']?.calls).toBe(2)
    expect(report.bySession['sess-2']?.calls).toBe(1)
  })

  it('accumulates by user', async () => {
    const tracker = makeTracker()
    tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 500, userId: 'user-a' })
    tracker.track({ model: 'gpt-4o', inputTokens: 500, outputTokens: 200, userId: 'user-a' })
    const report = await tracker.getReport()
    expect(report.byUser['user-a']?.calls).toBe(2)
  })

  it('reset() clears all state', async () => {
    const tracker = makeTracker()
    tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 500 })
    await tracker.reset()
    const report = await tracker.getReport()
    expect(report.totalCostUSD).toBe(0)
    expect(report.byModel).toEqual({})
  })

  it('resetSession() removes only that session', async () => {
    const tracker = makeTracker()
    tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 500, sessionId: 'keep' })
    tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 500, sessionId: 'drop' })
    await tracker.resetSession('drop')
    const report = await tracker.getReport()
    expect(report.bySession['keep']).toBeDefined()
    expect(report.bySession['drop']).toBeUndefined()
  })

  it('exportJSON() returns valid JSON matching getReport()', async () => {
    const tracker = makeTracker()
    tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 500 })
    const json = await tracker.exportJSON()
    expect(() => JSON.parse(json)).not.toThrow()
    expect(JSON.parse(json)).toMatchObject(await tracker.getReport())
  })

  it('exportCSV() returns CSV with header and one row per call', async () => {
    const tracker = makeTracker()
    tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 500 })
    tracker.track({ model: 'gpt-4o-mini', inputTokens: 500, outputTokens: 200 })
    const csv = await tracker.exportCSV()
    const lines = csv.split('\n')
    expect(lines[0]).toBe('timestamp,model,inputTokens,outputTokens,costUSD,sessionId,userId')
    expect(lines).toHaveLength(3) // header + 2 rows
  })

  it('exportCSV() escapes commas in sessionId and userId', async () => {
    const tracker = makeTracker()
    tracker.track({ model: 'gpt-4o', inputTokens: 100, outputTokens: 50, sessionId: 'a,b', userId: 'u,v' })
    const csv = await tracker.exportCSV()
    const dataLine = csv.split('\n')[1] ?? ''
    expect(dataLine).toContain('"a,b"')
    expect(dataLine).toContain('"u,v"')
  })

  it('exportCSV() escapes double-quotes in field values', async () => {
    const tracker = makeTracker()
    tracker.track({ model: 'gpt-4o', inputTokens: 100, outputTokens: 50, sessionId: 'say "hi"' })
    const csv = await tracker.exportCSV()
    const dataLine = csv.split('\n')[1] ?? ''
    expect(dataLine).toContain('"say ""hi"""')
  })

  it('customPrices overrides bundled prices', async () => {
    const tracker = makeTracker({
      customPrices: { 'gpt-4o': { input: 100, output: 100 } },
    })
    tracker.track({ model: 'gpt-4o', inputTokens: 1_000_000, outputTokens: 1_000_000 })
    const report = await tracker.getReport()
    expect(report.totalCostUSD).toBeCloseTo(200)
  })

  it('unknown model records zero cost and does not throw', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tracker = makeTracker()
    expect(() => {
      tracker.track({ model: 'totally-unknown-xyz', inputTokens: 1000, outputTokens: 500 })
    }).not.toThrow()
    expect((await tracker.getReport()).totalCostUSD).toBe(0)
    vi.restoreAllMocks()
  })

  it('fires webhook when threshold is crossed', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true } as Response)
    global.fetch = mockFetch

    const tracker = makeTracker({
      alertThreshold: 0.000001, // very low threshold
      webhookUrl: 'https://hooks.example.com/webhook',
    })

    tracker.track({ model: 'gpt-4o', inputTokens: 1_000_000, outputTokens: 0 })

    // Allow microtask queue to flush
    await new Promise((r) => setTimeout(r, 0))
    expect(mockFetch).toHaveBeenCalledWith(
      'https://hooks.example.com/webhook',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('fires webhook only once even after multiple calls above threshold', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true } as Response)
    global.fetch = mockFetch

    const tracker = makeTracker({
      alertThreshold: 0.000001,
      webhookUrl: 'https://hooks.example.com/webhook',
    })

    tracker.track({ model: 'gpt-4o', inputTokens: 1_000_000, outputTokens: 0 })
    tracker.track({ model: 'gpt-4o', inputTokens: 1_000_000, outputTokens: 0 })

    await new Promise((r) => setTimeout(r, 0))
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})

describe('getModelInfo', () => {
  it('returns price and maxInputTokens for a known model', () => {
    const tracker = makeTracker()
    const info = tracker.getModelInfo('gpt-4o')
    expect(info).not.toBeNull()
    expect(info?.input).toBeGreaterThan(0)
    expect(info?.output).toBeGreaterThan(0)
    expect(info?.maxInputTokens).toBeGreaterThan(0)
  })

  it('returns null for an unknown model', () => {
    const tracker = makeTracker()
    expect(tracker.getModelInfo('totally-unknown-model-xyz')).toBeNull()
  })

  it('returns customPrices entry when provided', () => {
    const tracker = makeTracker({
      customPrices: { 'my-model': { input: 7, output: 14, maxInputTokens: 32000 } },
    })
    const info = tracker.getModelInfo('my-model')
    expect(info).toEqual({ input: 7, output: 14, maxInputTokens: 32000 })
  })
})

describe('createTracker — zod config validation', () => {
  it('throws on invalid storage value', () => {
    expect(() =>
      createTracker({ syncPrices: false, storage: 'redis' as 'memory' }),
    ).toThrow('[tokenwatch] Invalid config')
  })

  it('throws on negative alertThreshold', () => {
    expect(() =>
      createTracker({ syncPrices: false, alertThreshold: -1 }),
    ).toThrow('[tokenwatch] Invalid config')
  })

  it('throws on malformed webhookUrl', () => {
    expect(() =>
      createTracker({ syncPrices: false, webhookUrl: 'not-a-url' }),
    ).toThrow('[tokenwatch] Invalid config')
  })

  it('throws on invalid customPrices (negative price)', () => {
    expect(() =>
      createTracker({
        syncPrices: false,
        customPrices: { 'my-model': { input: -1, output: 0 } },
      }),
    ).toThrow('[tokenwatch] Invalid config')
  })

  it('accepts valid config without throwing', () => {
    expect(() =>
      createTracker({
        syncPrices: false,
        storage: 'memory',
        alertThreshold: 5.0,
        webhookUrl: 'https://hooks.slack.com/test',
        customPrices: { 'my-model': { input: 1, output: 2 } },
      }),
    ).not.toThrow()
  })
})
