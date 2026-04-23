import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createTracker } from '../../src/core/tracker.js'

const WEBHOOK = 'https://hooks.slack.com/test'

function makeTracker(overrides = {}) {
  return createTracker({
    syncPrices: false,
    customPrices: { 'gpt-4o': { input: 2.5, output: 10 } },
    anomalyDetection: {
      multiplierThreshold: 3,
      webhookUrl: WEBHOOK,
    },
    ...overrides,
  })
}

describe('anomaly detection', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({ ok: true } as Response)
    global.fetch = mockFetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not alert when there is no prior history for a model (first call)', async () => {
    const tracker = makeTracker()
    tracker.track({ model: 'gpt-4o', inputTokens: 1_000_000, outputTokens: 500_000 })
    await new Promise((r) => setTimeout(r, 20))
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not alert when cost is within the threshold', async () => {
    const tracker = makeTracker()
    // 5 baseline calls at ~$0.005 each
    for (let i = 0; i < 5; i++) {
      tracker.track({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 200 })
    }
    await new Promise((r) => setTimeout(r, 20))
    mockFetch.mockClear()
    // A 2x cost call — below the 3x threshold
    tracker.track({ model: 'gpt-4o', inputTokens: 2000, outputTokens: 400 })
    await new Promise((r) => setTimeout(r, 20))
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fires model webhook when call cost is above multiplierThreshold × average', async () => {
    const tracker = makeTracker()
    // 5 cheap baseline calls
    for (let i = 0; i < 5; i++) {
      tracker.track({ model: 'gpt-4o', inputTokens: 100, outputTokens: 50 })
    }
    await new Promise((r) => setTimeout(r, 20))
    mockFetch.mockClear()
    // One very expensive call (many tokens)
    tracker.track({ model: 'gpt-4o', inputTokens: 1_000_000, outputTokens: 500_000 })
    await new Promise((r) => setTimeout(r, 20))
    const modelCalls = mockFetch.mock.calls.filter((c) =>
      (JSON.parse(c[1].body as string) as { text: string }).text.includes('model "gpt-4o"'),
    )
    expect(modelCalls.length).toBeGreaterThan(0)
    expect(modelCalls[0]?.[0]).toBe(WEBHOOK)
  })

  it('fires user webhook when user call cost is anomalous', async () => {
    const tracker = makeTracker()
    // 5 cheap calls for user-1
    for (let i = 0; i < 5; i++) {
      tracker.track({ model: 'gpt-4o', inputTokens: 100, outputTokens: 50, userId: 'user-1' })
    }
    await new Promise((r) => setTimeout(r, 20))
    mockFetch.mockClear()
    // Expensive call for user-1
    tracker.track({ model: 'gpt-4o', inputTokens: 1_000_000, outputTokens: 500_000, userId: 'user-1' })
    await new Promise((r) => setTimeout(r, 20))
    const userCalls = mockFetch.mock.calls.filter((c) =>
      (JSON.parse(c[1].body as string) as { text: string }).text.includes('user "user-1"'),
    )
    expect(userCalls.length).toBeGreaterThan(0)
  })

  it('mode: once — fires only once even after multiple anomalous calls', async () => {
    const tracker = makeTracker({ anomalyDetection: { multiplierThreshold: 3, webhookUrl: WEBHOOK, mode: 'once' } })
    for (let i = 0; i < 5; i++) {
      tracker.track({ model: 'gpt-4o', inputTokens: 100, outputTokens: 50 })
    }
    await new Promise((r) => setTimeout(r, 20))
    mockFetch.mockClear()
    // Two anomalous calls — should only fire once (model key)
    tracker.track({ model: 'gpt-4o', inputTokens: 1_000_000, outputTokens: 500_000 })
    await new Promise((r) => setTimeout(r, 20))
    tracker.track({ model: 'gpt-4o', inputTokens: 1_000_000, outputTokens: 500_000 })
    await new Promise((r) => setTimeout(r, 20))
    const modelCalls = mockFetch.mock.calls.filter((c) =>
      (JSON.parse(c[1].body as string) as { text: string }).text.includes('model "gpt-4o"'),
    )
    expect(modelCalls.length).toBe(1)
  })

  it('mode: always — fires on every anomalous call', async () => {
    const tracker = makeTracker({ anomalyDetection: { multiplierThreshold: 3, webhookUrl: WEBHOOK, mode: 'always' } })
    for (let i = 0; i < 5; i++) {
      tracker.track({ model: 'gpt-4o', inputTokens: 100, outputTokens: 50 })
    }
    await new Promise((r) => setTimeout(r, 20))
    mockFetch.mockClear()
    tracker.track({ model: 'gpt-4o', inputTokens: 1_000_000, outputTokens: 500_000 })
    await new Promise((r) => setTimeout(r, 20))
    tracker.track({ model: 'gpt-4o', inputTokens: 1_000_000, outputTokens: 500_000 })
    await new Promise((r) => setTimeout(r, 20))
    const modelCalls = mockFetch.mock.calls.filter((c) =>
      (JSON.parse(c[1].body as string) as { text: string }).text.includes('model "gpt-4o"'),
    )
    expect(modelCalls.length).toBe(2)
  })

  it('does not alert when anomalyDetection is not configured', async () => {
    const tracker = createTracker({
      syncPrices: false,
      customPrices: { 'gpt-4o': { input: 2.5, output: 10 } },
    })
    for (let i = 0; i < 5; i++) {
      tracker.track({ model: 'gpt-4o', inputTokens: 100, outputTokens: 50 })
    }
    tracker.track({ model: 'gpt-4o', inputTokens: 1_000_000, outputTokens: 500_000 })
    await new Promise((r) => setTimeout(r, 20))
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('entry with no userId — only model check runs, no user webhook', async () => {
    const tracker = makeTracker()
    for (let i = 0; i < 5; i++) {
      tracker.track({ model: 'gpt-4o', inputTokens: 100, outputTokens: 50 })
    }
    await new Promise((r) => setTimeout(r, 20))
    mockFetch.mockClear()
    tracker.track({ model: 'gpt-4o', inputTokens: 1_000_000, outputTokens: 500_000 })
    await new Promise((r) => setTimeout(r, 20))
    const userCalls = mockFetch.mock.calls.filter((c) =>
      (JSON.parse(c[1].body as string) as { text: string }).text.includes('user "'),
    )
    expect(userCalls.length).toBe(0)
  })

  it('reset() clears the latch — anomaly fires again after reset', async () => {
    const tracker = makeTracker()
    for (let i = 0; i < 5; i++) {
      tracker.track({ model: 'gpt-4o', inputTokens: 100, outputTokens: 50 })
    }
    await new Promise((r) => setTimeout(r, 20))
    // First anomaly fires
    tracker.track({ model: 'gpt-4o', inputTokens: 1_000_000, outputTokens: 500_000 })
    await new Promise((r) => setTimeout(r, 20))
    mockFetch.mockClear()
    // After reset, latch is cleared — next anomaly fires again
    await tracker.reset()
    for (let i = 0; i < 5; i++) {
      tracker.track({ model: 'gpt-4o', inputTokens: 100, outputTokens: 50 })
    }
    await new Promise((r) => setTimeout(r, 20))
    mockFetch.mockClear()
    tracker.track({ model: 'gpt-4o', inputTokens: 1_000_000, outputTokens: 500_000 })
    await new Promise((r) => setTimeout(r, 20))
    const modelCalls = mockFetch.mock.calls.filter((c) =>
      (JSON.parse(c[1].body as string) as { text: string }).text.includes('model "gpt-4o"'),
    )
    expect(modelCalls.length).toBeGreaterThan(0)
  })

  it('webhook message includes multiplier and average cost', async () => {
    const tracker = makeTracker()
    for (let i = 0; i < 5; i++) {
      tracker.track({ model: 'gpt-4o', inputTokens: 100, outputTokens: 50 })
    }
    await new Promise((r) => setTimeout(r, 20))
    mockFetch.mockClear()
    tracker.track({ model: 'gpt-4o', inputTokens: 1_000_000, outputTokens: 500_000 })
    await new Promise((r) => setTimeout(r, 20))
    const body = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string) as { text: string }
    expect(body.text).toMatch(/Anomaly/)
    expect(body.text).toMatch(/model "gpt-4o"/)
    expect(body.text).toMatch(/x above/)
    expect(body.text).toMatch(/average/)
  })
})
