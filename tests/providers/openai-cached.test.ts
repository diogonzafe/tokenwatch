import { describe, it, expect, vi } from 'vitest'
import { wrapOpenAI } from '../../src/providers/openai.js'
import { createTracker } from '../../src/core/tracker.js'

function makeTracker() {
  return createTracker({ syncPrices: false })
}

function makeClient(usageOverride?: Record<string, unknown>) {
  const defaultUsage = {
    prompt_tokens: 1000,
    completion_tokens: 200,
    prompt_tokens_details: { cached_tokens: 400 },
  }
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          model: 'gpt-4o',
          usage: usageOverride ?? defaultUsage,
        }),
      },
    },
  }
}

describe('wrapOpenAI — cached token extraction', () => {
  it('stores inputTokens = prompt_tokens - cached_tokens in report', async () => {
    const tracker = makeTracker() // 1000 prompt, 400 cached → 600 regular
    const client = makeClient()
    const wrapped = wrapOpenAI(client, tracker)

    await wrapped.chat.completions.create({ model: 'gpt-4o', messages: [] })

    const report = await tracker.getReport()
    // totalTokens.input = inputTokens + cachedTokens = 600 + 400 = 1000
    expect(report.totalTokens.input).toBe(1000)
    // byModel cached count
    expect(report.byModel['gpt-4o']?.tokens.cached).toBe(400)
  })

  it('records lower cost when cached tokens are present', async () => {
    const tracker = createTracker({
      syncPrices: false,
      customPrices: {
        'gpt-4o': { input: 2.5, output: 10, cachedInput: 1.25 },
      },
    })
    const client = makeClient()
    const wrapped = wrapOpenAI(client, tracker)

    await wrapped.chat.completions.create({ model: 'gpt-4o', messages: [] })

    const report = await tracker.getReport()
    // 600 regular input at $2.5/M + 400 cached at $1.25/M + 200 output at $10/M
    const expected = (600 / 1e6) * 2.5 + (400 / 1e6) * 1.25 + (200 / 1e6) * 10
    expect(report.totalCostUSD).toBeCloseTo(expected, 6)
  })

  it('records correct total tokens when no cached tokens', async () => {
    const tracker = makeTracker()
    const client = makeClient({ prompt_tokens: 500, completion_tokens: 100 }) // no cached details
    const wrapped = wrapOpenAI(client, tracker)

    await wrapped.chat.completions.create({ model: 'gpt-4o', messages: [] })

    const report = await tracker.getReport()
    expect(report.totalTokens.input).toBe(500) // all regular
    expect(report.byModel['gpt-4o']?.tokens.cached).toBe(0)
  })

  it('handles prompt_tokens_details with 0 cached_tokens', async () => {
    const tracker = makeTracker()
    const client = makeClient({
      prompt_tokens: 800,
      completion_tokens: 100,
      prompt_tokens_details: { cached_tokens: 0 },
    })
    const wrapped = wrapOpenAI(client, tracker)

    await wrapped.chat.completions.create({ model: 'gpt-4o', messages: [] })

    const report = await tracker.getReport()
    expect(report.totalTokens.input).toBe(800)
    expect(report.byModel['gpt-4o']?.tokens.cached).toBe(0)
  })
})
