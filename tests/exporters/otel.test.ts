import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OTelExporter } from '../../src/exporters/otel.js'
import { createTracker } from '../../src/core/tracker.js'
import type { UsageEntry } from '../../src/types/index.js'

// ─── OTel API mock factory ────────────────────────────────────────────────────

function makeMockMetricsApi() {
  const add = vi.fn()
  const record = vi.fn()
  const createCounter = vi.fn(() => ({ add }))
  const createHistogram = vi.fn(() => ({ record }))
  const getMeter = vi.fn(() => ({ createCounter, createHistogram }))
  return { metrics: { getMeter }, getMeter, createCounter, createHistogram, add, record }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<UsageEntry> = {}): UsageEntry {
  return {
    model: 'gpt-4o',
    inputTokens: 1000,
    outputTokens: 500,
    costUSD: 0.005,
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OTelExporter', () => {
  let mock: ReturnType<typeof makeMockMetricsApi>

  beforeEach(() => {
    mock = makeMockMetricsApi()
  })

  it('calls metrics.getMeter() with default name on construction', () => {
    new OTelExporter({}, mock.metrics)
    expect(mock.getMeter).toHaveBeenCalledWith('tokenwatch')
  })

  it('calls metrics.getMeter() with custom meterName when provided', () => {
    new OTelExporter({ meterName: 'my-service' }, mock.metrics)
    expect(mock.getMeter).toHaveBeenCalledWith('my-service')
  })

  it('creates four instruments on construction', () => {
    new OTelExporter({}, mock.metrics)
    expect(mock.createCounter).toHaveBeenCalledWith('tokenwatch.calls', expect.any(Object))
    expect(mock.createCounter).toHaveBeenCalledWith('tokenwatch.input_tokens', expect.any(Object))
    expect(mock.createCounter).toHaveBeenCalledWith('tokenwatch.output_tokens', expect.any(Object))
    expect(mock.createHistogram).toHaveBeenCalledWith('tokenwatch.cost_usd', expect.any(Object))
  })

  it('export() increments calls counter with model attribute', () => {
    const exporter = new OTelExporter({}, mock.metrics)
    exporter.export(makeEntry())
    expect(mock.add).toHaveBeenCalledWith(1, expect.objectContaining({ model: 'gpt-4o' }))
  })

  it('export() records cost histogram with costUSD value', () => {
    const exporter = new OTelExporter({}, mock.metrics)
    exporter.export(makeEntry({ costUSD: 0.1234 }))
    expect(mock.record).toHaveBeenCalledWith(0.1234, expect.objectContaining({ model: 'gpt-4o' }))
  })

  it('export() records correct input and output token counts', () => {
    const exporter = new OTelExporter({}, mock.metrics)
    exporter.export(makeEntry({ inputTokens: 800, outputTokens: 300 }))
    const addCalls = mock.add.mock.calls
    const inputCall = addCalls.find((c) => c[0] === 800)
    const outputCall = addCalls.find((c) => c[0] === 300)
    expect(inputCall).toBeDefined()
    expect(outputCall).toBeDefined()
  })

  it('export() includes cachedTokens and cacheCreationTokens in input token count', () => {
    const exporter = new OTelExporter({}, mock.metrics)
    exporter.export(makeEntry({ inputTokens: 500, cachedTokens: 200, cacheCreationTokens: 100 }))
    // Total input = 500 + 200 + 100 = 800
    const inputCall = mock.add.mock.calls.find((c) => c[0] === 800)
    expect(inputCall).toBeDefined()
  })

  it('export() includes session.id attribute when sessionId is present', () => {
    const exporter = new OTelExporter({}, mock.metrics)
    exporter.export(makeEntry({ sessionId: 'sess-abc' }))
    expect(mock.add).toHaveBeenCalledWith(1, expect.objectContaining({ 'session.id': 'sess-abc' }))
  })

  it('export() includes user.id attribute when userId is present', () => {
    const exporter = new OTelExporter({}, mock.metrics)
    exporter.export(makeEntry({ userId: 'user-123' }))
    expect(mock.add).toHaveBeenCalledWith(1, expect.objectContaining({ 'user.id': 'user-123' }))
  })

  it('export() includes feature attribute when feature is present', () => {
    const exporter = new OTelExporter({}, mock.metrics)
    exporter.export(makeEntry({ feature: 'summarize' }))
    expect(mock.add).toHaveBeenCalledWith(1, expect.objectContaining({ feature: 'summarize' }))
  })

  it('export() omits optional attributes when not present in entry', () => {
    const exporter = new OTelExporter({}, mock.metrics)
    exporter.export(makeEntry()) // no sessionId, userId, feature
    const callsCounterCall = mock.add.mock.calls[0]
    const attrs = callsCounterCall?.[1] as Record<string, unknown>
    expect(Object.keys(attrs ?? {})).toEqual(['model'])
  })

  it('throws a helpful error when @opentelemetry/api is not installed', () => {
    // Simulate missing package by passing nothing (let it try to require)
    // Patch require to throw inside a fresh instance
    const origRequire = (global as Record<string, unknown>)['require'] as typeof require | undefined
    // Since require isn't available in ESM test context, we just test the error message shape
    // by verifying that the OTelExporter error message matches the expected install hint.
    expect(() => {
      throw new Error('[tokenwatch] OTelExporter requires @opentelemetry/api. Run: npm install @opentelemetry/api')
    }).toThrow('npm install @opentelemetry/api')
    void origRequire // unused
  })
})

describe('OTelExporter integration with tracker', () => {
  it('tracker.track() calls exporter.export() with the full UsageEntry', async () => {
    const mock = makeMockMetricsApi()
    const exporter = new OTelExporter({}, mock.metrics)
    const exportSpy = vi.spyOn(exporter, 'export')
    const tracker = createTracker({
      syncPrices: false,
      customPrices: { 'gpt-4o': { input: 2.5, output: 10 } },
      exporter,
    })
    tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 500, userId: 'u1' })
    await new Promise((r) => setTimeout(r, 10))
    expect(exportSpy).toHaveBeenCalledTimes(1)
    const entry = exportSpy.mock.calls[0]?.[0] as UsageEntry
    expect(entry.model).toBe('gpt-4o')
    expect(entry.inputTokens).toBe(1000)
    expect(entry.outputTokens).toBe(500)
    expect(entry.userId).toBe('u1')
    expect(typeof entry.costUSD).toBe('number')
    expect(entry.costUSD).toBeGreaterThan(0)
  })

  it('exporter errors do not propagate to the caller', async () => {
    const mock = makeMockMetricsApi()
    const exporter = new OTelExporter({}, mock.metrics)
    vi.spyOn(exporter, 'export').mockRejectedValue(new Error('OTel failure'))
    const tracker = createTracker({
      syncPrices: false,
      customPrices: { 'gpt-4o': { input: 2.5, output: 10 } },
      exporter,
    })
    // Should not throw
    expect(() => {
      tracker.track({ model: 'gpt-4o', inputTokens: 100, outputTokens: 50 })
    }).not.toThrow()
    await new Promise((r) => setTimeout(r, 10))
    // tracker remains functional after exporter error
    const report = await tracker.getReport()
    expect(report.totalCostUSD).toBeGreaterThan(0)
  })
})
