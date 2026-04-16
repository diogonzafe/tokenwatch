import { describe, it, expect, vi } from 'vitest'
import { wrapDeepSeek } from '../../src/providers/deepseek.js'
import { createTracker } from '../../src/core/tracker.js'

describe('wrapDeepSeek', () => {
  it('delegates to wrapOpenAI — strips meta fields and records usage', async () => {
    const tracker = createTracker({ syncPrices: false })

    const createFn = vi.fn().mockResolvedValue({
      model: 'deepseek-chat',
      usage: { prompt_tokens: 200, completion_tokens: 80 },
    })

    const client = { chat: { completions: { create: createFn } } }
    const wrapped = wrapDeepSeek(client, tracker)

    await wrapped.chat.completions.create({
      model: 'deepseek-chat',
      messages: [],
      __sessionId: 'ds-sess',
    } as Record<string, unknown>)

    // Meta field stripped
    const callArgs = createFn.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArgs).not.toHaveProperty('__sessionId')

    // Usage recorded
    const report = tracker.getReport()
    expect(report.totalTokens.input).toBe(200)
    expect(report.totalTokens.output).toBe(80)
    expect(report.bySession['ds-sess']).toBeDefined()
  })
})
