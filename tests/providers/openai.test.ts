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
}) {
  const usage = overrides?.usage ?? { prompt_tokens: 100, completion_tokens: 50 }

  const createFn = vi.fn(async (params: Record<string, unknown>) => {
    if (overrides?.isStream) {
      // Return a minimal async iterable simulating a stream
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

  return {
    chat: {
      completions: { create: createFn },
    },
    _createFn: createFn,
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

  it('strips __sessionId and __userId before sending to API', async () => {
    const tracker = makeTracker()
    const client = makeOpenAIClient()
    const wrapped = wrapOpenAI(client, tracker)

    await wrapped.chat.completions.create({
      model: 'gpt-4o',
      messages: [],
      __sessionId: 'sess-1',
      __userId: 'user-1',
    } as Record<string, unknown>)

    const callArgs = client._createFn.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArgs).not.toHaveProperty('__sessionId')
    expect(callArgs).not.toHaveProperty('__userId')
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

  it('records sessionId and userId in tracking entry', async () => {
    const tracker = makeTracker()
    const client = makeOpenAIClient()
    const wrapped = wrapOpenAI(client, tracker)

    await wrapped.chat.completions.create({
      model: 'gpt-4o',
      messages: [],
      __sessionId: 'sess-xyz',
      __userId: 'user-abc',
    } as Record<string, unknown>)

    const report = await tracker.getReport()
    expect(report.bySession['sess-xyz']).toBeDefined()
    expect(report.byUser['user-abc']).toBeDefined()
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
    expect(report.byModel['gpt-4o']?.calls).toBe(1)   // call IS recorded
    expect(report.totalCostUSD).toBe(0)                 // but at $0
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

    // Consume the stream
    for await (const _ of stream as AsyncIterable<unknown>) {
      // consume
    }

    const report = await tracker.getReport()
    expect(report.totalTokens.input).toBe(150)
    expect(report.totalTokens.output).toBe(60)
  })
})
