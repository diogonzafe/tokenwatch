import { describe, it, expect, vi, beforeEach } from 'vitest'
import { wrapOpenAI } from '../../src/providers/openai.js'
import { createTracker } from '../../src/core/tracker.js'
import type { Tracker } from '../../src/types/index.js'

function makeTracker(): Tracker {
  return createTracker({ syncPrices: false })
}

function makeOpenAIClient(overrides?: {
  usage?: object | null
  isStream?: boolean
  embeddingUsage?: object | null
}) {
  const usage = overrides?.usage ?? { prompt_tokens: 100, completion_tokens: 50 }

  const createFn = vi.fn(async (params: Record<string, unknown>) => {
    if (overrides?.isStream) {
      async function* gen() {
        yield { model: 'gpt-4o', usage: null }
        yield { model: 'gpt-4o', usage }
      }
      return gen()
    }
    return {
      id: 'cmpl-123',
      model: params['model'] ?? 'gpt-4o',
      usage,
    }
  })

  const embeddingCreateFn = vi.fn(async (params: Record<string, unknown>) => ({
    model: params['model'] ?? 'text-embedding-3-small',
    usage: overrides?.embeddingUsage ?? { prompt_tokens: 50, total_tokens: 50 },
    data: [],
  }))

  return {
    chat: { completions: { create: createFn } },
    embeddings: { create: embeddingCreateFn },
    _createFn: createFn,
    _embeddingCreateFn: embeddingCreateFn,
  }
}

describe('wrapOpenAI', () => {
  it('passes through non-tracking params unchanged', async () => {
    const tracker = makeTracker()
    const client = makeOpenAIClient()
    const wrapped = wrapOpenAI(client, tracker)

    await wrapped.chat.completions.create({ model: 'gpt-4o', messages: [] })
    expect(client._createFn).toHaveBeenCalledWith({ model: 'gpt-4o', messages: [] })
  })

  it('strips __sessionId, __userId and __feature before sending to API', async () => {
    const tracker = makeTracker()
    const client = makeOpenAIClient()
    const wrapped = wrapOpenAI(client, tracker)

    await wrapped.chat.completions.create({
      model: 'gpt-4o',
      messages: [],
      __sessionId: 'sess-1',
      __userId: 'user-1',
      __feature: 'search',
    } as Record<string, unknown>)

    const callArgs = client._createFn.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArgs).not.toHaveProperty('__sessionId')
    expect(callArgs).not.toHaveProperty('__userId')
    expect(callArgs).not.toHaveProperty('__feature')
  })

  it('records usage after successful call', async () => {
    const tracker = makeTracker()
    const client = makeOpenAIClient({ usage: { prompt_tokens: 200, completion_tokens: 80 } })
    const wrapped = wrapOpenAI(client, tracker)

    await wrapped.chat.completions.create({ model: 'gpt-4o', messages: [] })

    const report = await tracker.getReport()
    expect(report.totalTokens.input).toBe(200)
    expect(report.totalTokens.output).toBe(80)
  })

  it('records sessionId, userId and feature in tracking entry', async () => {
    const tracker = makeTracker()
    const client = makeOpenAIClient()
    const wrapped = wrapOpenAI(client, tracker)

    await wrapped.chat.completions.create({
      model: 'gpt-4o',
      messages: [],
      __sessionId: 'sess-xyz',
      __userId: 'user-abc',
      __feature: 'summarizer',
    } as Record<string, unknown>)

    const report = await tracker.getReport()
    expect(report.bySession['sess-xyz']).toBeDefined()
    expect(report.byUser['user-abc']).toBeDefined()
    expect(report.byFeature['summarizer']).toBeDefined()
    expect(report.byFeature['summarizer']?.calls).toBe(1)
  })

  it('does NOT record cost when API call throws', async () => {
    const tracker = makeTracker()
    const errorClient = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error('API error')),
        },
      },
    }
    const wrapped = wrapOpenAI(errorClient, tracker)

    await expect(
      wrapped.chat.completions.create({ model: 'gpt-4o', messages: [] }),
    ).rejects.toThrow('API error')

    expect((await tracker.getReport()).totalCostUSD).toBe(0)
  })

  it('returns the original response object unchanged', async () => {
    const tracker = makeTracker()
    const expectedResponse = { id: 'cmpl-999', model: 'gpt-4o', usage: { prompt_tokens: 10, completion_tokens: 5 } }
    const client = {
      chat: {
        completions: { create: vi.fn().mockResolvedValue(expectedResponse) },
      },
    }
    const wrapped = wrapOpenAI(client, tracker)
    const result = await wrapped.chat.completions.create({ model: 'gpt-4o', messages: [] })
    expect(result).toEqual(expectedResponse)
  })

  it('records $0 and warns when stream has no usage data', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tracker = makeTracker()
    const noUsageClient = {
      chat: {
        completions: {
          create: vi.fn(async (_params: Record<string, unknown>) => {
            async function* gen() {
              yield { model: 'gpt-4o', usage: null }
              yield { model: 'gpt-4o', usage: null }
            }
            return gen()
          }),
        },
      },
    }
    const wrapped = wrapOpenAI(noUsageClient, tracker)
    const stream = await wrapped.chat.completions.create({ model: 'gpt-4o', messages: [], stream: true })
    for await (const _ of stream as AsyncIterable<unknown>) { /* consume */ }

    const report = await tracker.getReport()
    expect(report.byModel['gpt-4o']?.calls).toBe(1)
    expect(report.totalCostUSD).toBe(0)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('include_usage'))
    vi.restoreAllMocks()
  })

  it('accumulates streaming usage from last chunk', async () => {
    const tracker = makeTracker()
    const client = makeOpenAIClient({
      isStream: true,
      usage: { prompt_tokens: 150, completion_tokens: 60 },
    })
    const wrapped = wrapOpenAI(client, tracker)

    const stream = await wrapped.chat.completions.create({
      model: 'gpt-4o',
      messages: [],
      stream: true,
    })

    for await (const _ of stream as AsyncIterable<unknown>) { /* consume */ }

    const report = await tracker.getReport()
    expect(report.totalTokens.input).toBe(150)
    expect(report.totalTokens.output).toBe(60)
  })
})

describe('wrapOpenAI — reasoning tokens (#1)', () => {
  it('records reasoning_tokens from completion_tokens_details', async () => {
    const tracker = makeTracker()
    const client = makeOpenAIClient({
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 500,
        completion_tokens_details: { reasoning_tokens: 400 },
      },
    })
    const wrapped = wrapOpenAI(client, tracker)
    await wrapped.chat.completions.create({ model: 'o3', messages: [] })

    const report = await tracker.getReport()
    expect(report.byModel['o3']?.tokens.reasoning).toBe(400)
  })

  it('adds reasoning tokens to cost (priced as output)', async () => {
    const tracker = createTracker({
      syncPrices: false,
      customPrices: { 'o3': { input: 0, output: 10 } }, // $10/M output
    })
    const client = makeOpenAIClient({
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        completion_tokens_details: { reasoning_tokens: 1_000_000 },
      },
    })
    const wrapped = wrapOpenAI(client, tracker)
    await wrapped.chat.completions.create({ model: 'o3', messages: [] })

    const report = await tracker.getReport()
    expect(report.totalCostUSD).toBeCloseTo(10) // 1M reasoning tokens × $10/M
  })

  it('records reasoning_tokens from last stream chunk', async () => {
    const tracker = makeTracker()
    const client = makeOpenAIClient({
      isStream: true,
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        completion_tokens_details: { reasoning_tokens: 30 },
      },
    })
    const wrapped = wrapOpenAI(client, tracker)
    const stream = await wrapped.chat.completions.create({ model: 'o3', messages: [], stream: true })
    for await (const _ of stream as AsyncIterable<unknown>) { /* consume */ }

    const report = await tracker.getReport()
    expect(report.byModel['o3']?.tokens.reasoning).toBe(30)
  })

  it('omits reasoningTokens field when zero', async () => {
    const tracker = makeTracker()
    const client = makeOpenAIClient({ usage: { prompt_tokens: 100, completion_tokens: 50 } })
    const wrapped = wrapOpenAI(client, tracker)
    await wrapped.chat.completions.create({ model: 'gpt-4o', messages: [] })

    // tokens.reasoning should be 0 (initialised in accumulator) but not break report
    const report = await tracker.getReport()
    expect(report.byModel['gpt-4o']?.tokens.reasoning).toBe(0)
  })
})

describe('wrapOpenAI — embeddings (#14)', () => {
  it('tracks embeddings.create using total_tokens as inputTokens', async () => {
    const tracker = makeTracker()
    const client = makeOpenAIClient({ embeddingUsage: { prompt_tokens: 40, total_tokens: 40 } })
    const wrapped = wrapOpenAI(client, tracker)

    await wrapped.embeddings.create({ model: 'text-embedding-3-small', input: 'hello' })

    const report = await tracker.getReport()
    expect(report.totalTokens.input).toBe(40)
    expect(report.totalTokens.output).toBe(0)
  })

  it('strips __sessionId, __userId, __feature from embeddings params', async () => {
    const tracker = makeTracker()
    const client = makeOpenAIClient()
    const wrapped = wrapOpenAI(client, tracker)

    await wrapped.embeddings.create({
      model: 'text-embedding-3-small',
      input: 'hello',
      __sessionId: 'sess-1',
      __userId: 'user-1',
      __feature: 'rag',
    } as Record<string, unknown>)

    const callArgs = client._embeddingCreateFn.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArgs).not.toHaveProperty('__sessionId')
    expect(callArgs).not.toHaveProperty('__userId')
    expect(callArgs).not.toHaveProperty('__feature')
  })

  it('records feature in byFeature for embeddings call', async () => {
    const tracker = makeTracker()
    const client = makeOpenAIClient()
    const wrapped = wrapOpenAI(client, tracker)

    await wrapped.embeddings.create({
      model: 'text-embedding-3-small',
      input: 'hello',
      __feature: 'rag',
    } as Record<string, unknown>)

    const report = await tracker.getReport()
    expect(report.byFeature['rag']).toBeDefined()
    expect(report.byFeature['rag']?.calls).toBe(1)
  })

  it('works when client has no embeddings property', async () => {
    const tracker = makeTracker()
    const minimalClient = {
      chat: { completions: { create: vi.fn().mockResolvedValue({ model: 'gpt-4o', usage: { prompt_tokens: 10, completion_tokens: 5 } }) } },
    }
    // Should not throw even without embeddings
    expect(() => wrapOpenAI(minimalClient, tracker)).not.toThrow()
  })
})
