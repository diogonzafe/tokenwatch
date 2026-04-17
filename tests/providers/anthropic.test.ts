import { describe, it, expect, vi } from 'vitest'
import { wrapAnthropic } from '../../src/providers/anthropic.js'
import { createTracker } from '../../src/core/tracker.js'
import type { Tracker } from '../../src/types/index.js'

function makeTracker(): Tracker {
  return createTracker({ syncPrices: false })
}

function makeAnthropicClient(overrides?: { isStream?: boolean }) {
  const createFn = vi.fn(async (params: Record<string, unknown>) => {
    if (overrides?.isStream) {
      async function* gen() {
        yield { type: 'message_start', message: { usage: { input_tokens: 120 } } }
        yield { type: 'content_block_delta', delta: { text: 'Hello' } }
        yield { type: 'message_delta', usage: { output_tokens: 30 } }
      }
      return gen()
    }
    return {
      id: 'msg_123',
      model: params['model'] ?? 'claude-sonnet-4-6',
      usage: { input_tokens: 100, output_tokens: 40 },
    }
  })

  return {
    messages: { create: createFn },
    _createFn: createFn,
  }
}

describe('wrapAnthropic', () => {
  it('strips __sessionId and __userId before sending to API', async () => {
    const tracker = makeTracker()
    const client = makeAnthropicClient()
    const wrapped = wrapAnthropic(client, tracker)

    await wrapped.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [],
      __sessionId: 'sess-1',
      __userId: 'user-1',
    } as Record<string, unknown>)

    const callArgs = client._createFn.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArgs).not.toHaveProperty('__sessionId')
    expect(callArgs).not.toHaveProperty('__userId')
  })

  it('records usage from non-streaming response', async () => {
    const tracker = makeTracker()
    const client = makeAnthropicClient()
    const wrapped = wrapAnthropic(client, tracker)

    await wrapped.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 1024, messages: [] })

    const report = await tracker.getReport()
    expect(report.totalTokens.input).toBe(100)
    expect(report.totalTokens.output).toBe(40)
  })

  it('does NOT record cost when API throws', async () => {
    const tracker = makeTracker()
    const errorClient = {
      messages: { create: vi.fn().mockRejectedValue(new Error('Auth error')) },
    }
    const wrapped = wrapAnthropic(errorClient, tracker)
    await expect(
      wrapped.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 1024, messages: [] }),
    ).rejects.toThrow('Auth error')
    expect((await tracker.getReport()).totalCostUSD).toBe(0)
  })

  it('accumulates streaming usage from message_start + message_delta events', async () => {
    const tracker = makeTracker()
    const client = makeAnthropicClient({ isStream: true })
    const wrapped = wrapAnthropic(client, tracker)

    const stream = await wrapped.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [],
      stream: true,
    })

    for await (const _ of stream as AsyncIterable<unknown>) {
      // consume
    }

    const report = await tracker.getReport()
    expect(report.totalTokens.input).toBe(120)
    expect(report.totalTokens.output).toBe(30)
  })

  it('records sessionId and userId', async () => {
    const tracker = makeTracker()
    const client = makeAnthropicClient()
    const wrapped = wrapAnthropic(client, tracker)

    await wrapped.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [],
      __sessionId: 'anthropic-sess',
      __userId: 'anthropic-user',
    } as Record<string, unknown>)

    const report = await tracker.getReport()
    expect(report.bySession['anthropic-sess']).toBeDefined()
    expect(report.byUser['anthropic-user']).toBeDefined()
  })
})
