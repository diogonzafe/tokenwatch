import { describe, it, expect, vi } from 'vitest'
import { wrapAnthropic } from '../../src/providers/anthropic.js'
import { createTracker } from '../../src/core/tracker.js'
import type { Tracker } from '../../src/types/index.js'

function makeTracker(): Tracker {
  return createTracker({ syncPrices: false })
}

function makeAnthropicClient(overrides?: { isStream?: boolean; withThinking?: boolean }) {
  const createFn = vi.fn(async (params: Record<string, unknown>) => {
    if (overrides?.isStream) {
      async function* gen() {
        yield { type: 'message_start', message: { usage: { input_tokens: 120 } } }
        if (overrides?.withThinking) {
          yield { type: 'content_block_start', content_block: { type: 'thinking' } }
          yield { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'A'.repeat(400) } }
          yield { type: 'content_block_stop' }
        }
        yield { type: 'content_block_delta', delta: { text: 'Hello' } }
        yield { type: 'message_delta', usage: { output_tokens: 30 } }
      }
      return gen()
    }

    const content = overrides?.withThinking
      ? [
          { type: 'thinking', thinking: 'A'.repeat(400) },
          { type: 'text', text: 'Answer' },
        ]
      : [{ type: 'text', text: 'Answer' }]

    return {
      id: 'msg_123',
      model: params['model'] ?? 'claude-sonnet-4-6',
      usage: { input_tokens: 100, output_tokens: 40 },
      content,
    }
  })

  return {
    messages: { create: createFn },
    _createFn: createFn,
  }
}

describe('wrapAnthropic', () => {
  it('strips __sessionId, __userId and __feature before sending to API', async () => {
    const tracker = makeTracker()
    const client = makeAnthropicClient()
    const wrapped = wrapAnthropic(client, tracker)

    await wrapped.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [],
      __sessionId: 'sess-1',
      __userId: 'user-1',
      __feature: 'chat',
    } as Record<string, unknown>)

    const callArgs = client._createFn.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArgs).not.toHaveProperty('__sessionId')
    expect(callArgs).not.toHaveProperty('__userId')
    expect(callArgs).not.toHaveProperty('__feature')
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

    for await (const _ of stream as AsyncIterable<unknown>) { /* consume */ }

    const report = await tracker.getReport()
    expect(report.totalTokens.input).toBe(120)
    expect(report.totalTokens.output).toBe(30)
  })

  it('records sessionId, userId and feature', async () => {
    const tracker = makeTracker()
    const client = makeAnthropicClient()
    const wrapped = wrapAnthropic(client, tracker)

    await wrapped.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [],
      __sessionId: 'anthropic-sess',
      __userId: 'anthropic-user',
      __feature: 'summarizer',
    } as Record<string, unknown>)

    const report = await tracker.getReport()
    expect(report.bySession['anthropic-sess']).toBeDefined()
    expect(report.byUser['anthropic-user']).toBeDefined()
    expect(report.byFeature['summarizer']).toBeDefined()
    expect(report.byFeature['summarizer']?.calls).toBe(1)
  })
})

describe('wrapAnthropic — reasoning tokens (#1)', () => {
  it('records approximate reasoningTokens from thinking content blocks (non-streaming)', async () => {
    const tracker = makeTracker()
    const client = makeAnthropicClient({ withThinking: true })
    const wrapped = wrapAnthropic(client, tracker)

    await wrapped.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 16000, messages: [] })

    const report = await tracker.getReport()
    // 400 chars ÷ 4 = 100 approximate tokens
    expect(report.byModel['claude-sonnet-4-6']?.tokens.reasoning).toBe(100)
  })

  it('does NOT double-count thinking tokens in cost (already in outputTokens)', async () => {
    const tracker = createTracker({
      syncPrices: false,
      customPrices: { 'claude-sonnet-4-6': { input: 0, output: 10 } },
    })
    const client = makeAnthropicClient({ withThinking: true })
    const wrapped = wrapAnthropic(client, tracker)

    await wrapped.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 16000, messages: [] })

    const report = await tracker.getReport()
    // Cost = outputTokens (40) only — thinking is already inside outputTokens
    // Mock: output_tokens=40, thinking_chars=400 → reasoningTokens≈100
    // If double-counted: cost = (40+100)/1M * 10 = 0.0014 — wrong
    // Correct cost:      (40/1M) * 10 = 0.0004
    expect(report.totalCostUSD).toBeCloseTo((40 / 1_000_000) * 10, 6)
  })

  it('records reasoning tokens from thinking blocks in stream', async () => {
    const tracker = makeTracker()
    const client = makeAnthropicClient({ isStream: true, withThinking: true })
    const wrapped = wrapAnthropic(client, tracker)

    const stream = await wrapped.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      messages: [],
      stream: true,
    })
    for await (const _ of stream as AsyncIterable<unknown>) { /* consume */ }

    const report = await tracker.getReport()
    // 400 chars ÷ 4 = 100 approximate tokens
    expect(report.byModel['claude-sonnet-4-6']?.tokens.reasoning).toBe(100)
  })

  it('records 0 reasoningTokens when no thinking blocks present', async () => {
    const tracker = makeTracker()
    const client = makeAnthropicClient()
    const wrapped = wrapAnthropic(client, tracker)

    await wrapped.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 1024, messages: [] })

    const report = await tracker.getReport()
    expect(report.byModel['claude-sonnet-4-6']?.tokens.reasoning).toBe(0)
  })
})
