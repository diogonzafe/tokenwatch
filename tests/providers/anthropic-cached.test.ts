import { describe, it, expect, vi } from 'vitest'
import { wrapAnthropic } from '../../src/providers/anthropic.js'
import { createTracker } from '../../src/core/tracker.js'

function makeTracker() {
  return createTracker({ syncPrices: false })
}

function makeClient(usageOverride?: Record<string, unknown>) {
  const defaultUsage = {
    input_tokens: 500,
    output_tokens: 200,
    cache_read_input_tokens: 300,
    cache_creation_input_tokens: 100,
  }
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        model: 'claude-sonnet-4-6',
        usage: usageOverride ?? defaultUsage,
        content: [],
      }),
    },
  }
}

describe('wrapAnthropic — cached token extraction', () => {
  it('includes cachedTokens in totalTokens.input', async () => {
    const tracker = makeTracker()
    const client = makeClient() // 500 regular + 300 cached read + 100 cache creation
    const wrapped = wrapAnthropic(client, tracker)

    await wrapped.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 100, messages: [] })

    const report = await tracker.getReport()
    // totalTokens.input = inputTokens + cachedTokens + cacheCreationTokens = 500 + 300 + 100 = 900
    expect(report.totalTokens.input).toBe(900)
    expect(report.byModel['claude-sonnet-4-6']?.tokens.cached).toBe(300)
  })

  it('records correct cost with Anthropic cache prices', async () => {
    const tracker = createTracker({
      syncPrices: false,
      customPrices: {
        'claude-sonnet-4-6': { input: 3, output: 15, cachedInput: 0.3, cacheCreationInput: 3.75 },
      },
    })
    const client = makeClient()
    const wrapped = wrapAnthropic(client, tracker)

    await wrapped.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 100, messages: [] })

    const report = await tracker.getReport()
    const expected =
      (500 / 1e6) * 3 +
      (300 / 1e6) * 0.3 +
      (100 / 1e6) * 3.75 +
      (200 / 1e6) * 15
    expect(report.totalCostUSD).toBeCloseTo(expected, 6)
  })

  it('records 0 cached when cache fields are absent', async () => {
    const tracker = makeTracker()
    const client = makeClient({ input_tokens: 200, output_tokens: 100 })
    const wrapped = wrapAnthropic(client, tracker)

    await wrapped.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 100, messages: [] })

    const report = await tracker.getReport()
    expect(report.totalTokens.input).toBe(200)
    expect(report.byModel['claude-sonnet-4-6']?.tokens.cached).toBe(0)
  })

  it('shows cached tokens in byModel report', async () => {
    const tracker = makeTracker()
    const client = makeClient()
    const wrapped = wrapAnthropic(client, tracker)

    await wrapped.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 100, messages: [] })

    const report = await tracker.getReport()
    expect(report.byModel['claude-sonnet-4-6']?.tokens.cached).toBe(300)
  })
})
