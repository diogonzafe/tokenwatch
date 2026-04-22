import { describe, it, expect, vi } from 'vitest'
import { TokenwatchCallbackHandler } from '../../src/langchain/handler.js'
import { createTracker } from '../../src/core/tracker.js'

// Cast to unknown then the parameter type since LLMResult is a local type in handler.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResult = any

describe('TokenwatchCallbackHandler', () => {
  it('extracts promptTokens / completionTokens from tokenUsage', async () => {
    const tracker = createTracker({
      syncPrices: false,
      customPrices: { 'gpt-4o': { input: 2.5, output: 10 } },
    })
    const handler = new TokenwatchCallbackHandler(tracker)
    const result: AnyResult = {
      llmOutput: { tokenUsage: { promptTokens: 1000, completionTokens: 200 } },
      generations: [[{ message: { response_metadata: { model_name: 'gpt-4o' } } }]],
    }
    await handler.handleLLMEnd(result)
    const report = await tracker.getReport()
    expect(report.byModel['gpt-4o']?.tokens.input).toBe(1000)
    expect(report.byModel['gpt-4o']?.tokens.output).toBe(200)
  })

  it('falls back to estimatedTokenUsage when tokenUsage is absent', async () => {
    const tracker = createTracker({
      syncPrices: false,
      customPrices: { 'gpt-4o': { input: 2.5, output: 10 } },
    })
    const handler = new TokenwatchCallbackHandler(tracker)
    const result: AnyResult = {
      llmOutput: { estimatedTokenUsage: { promptTokens: 800, completionTokens: 150 } },
      generations: [[{ message: { response_metadata: { model_name: 'gpt-4o' } } }]],
    }
    await handler.handleLLMEnd(result)
    const report = await tracker.getReport()
    expect(report.byModel['gpt-4o']?.tokens.input).toBe(800)
    expect(report.byModel['gpt-4o']?.tokens.output).toBe(150)
  })

  it('tracks 0 tokens and does not throw when neither tokenUsage nor estimatedTokenUsage', async () => {
    const tracker = createTracker({
      syncPrices: false,
      customPrices: { 'gpt-4o': { input: 2.5, output: 10 } },
    })
    const handler = new TokenwatchCallbackHandler(tracker, { defaultModel: 'gpt-4o' })
    const result: AnyResult = {
      llmOutput: {},
      generations: [[{ message: { response_metadata: { model_name: 'gpt-4o' } } }]],
    }
    await expect(handler.handleLLMEnd(result)).resolves.toBeUndefined()
    const report = await tracker.getReport()
    expect(report.totalCostUSD).toBe(0)
    expect(report.byModel['gpt-4o']?.calls).toBe(1)
  })

  it('extracts model name from response_metadata.model_name', async () => {
    const tracker = createTracker({
      syncPrices: false,
      customPrices: { 'claude-sonnet-4-6': { input: 3, output: 15 } },
    })
    const handler = new TokenwatchCallbackHandler(tracker)
    const result: AnyResult = {
      llmOutput: { tokenUsage: { promptTokens: 100, completionTokens: 50 } },
      generations: [[{ message: { response_metadata: { model_name: 'claude-sonnet-4-6' } } }]],
    }
    await handler.handleLLMEnd(result)
    const report = await tracker.getReport()
    expect(report.byModel['claude-sonnet-4-6']).toBeDefined()
  })

  it('falls back to options.defaultModel when response_metadata is absent', async () => {
    const tracker = createTracker({
      syncPrices: false,
      customPrices: { 'gpt-4o': { input: 2.5, output: 10 } },
    })
    const handler = new TokenwatchCallbackHandler(tracker, { defaultModel: 'gpt-4o' })
    const result: AnyResult = {
      llmOutput: { tokenUsage: { promptTokens: 100, completionTokens: 50 } },
      generations: [[{}]], // no message.response_metadata
    }
    await handler.handleLLMEnd(result)
    const report = await tracker.getReport()
    expect(report.byModel['gpt-4o']).toBeDefined()
  })

  it('falls back to "unknown" when no response_metadata and no defaultModel', async () => {
    const tracker = createTracker({ syncPrices: false })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const handler = new TokenwatchCallbackHandler(tracker)
    const result: AnyResult = {
      llmOutput: { tokenUsage: { promptTokens: 100, completionTokens: 50 } },
      generations: [[{}]],
    }
    await handler.handleLLMEnd(result)
    const report = await tracker.getReport()
    expect(report.byModel['unknown']).toBeDefined()
    vi.restoreAllMocks()
  })

  it('forwards sessionId, userId, and feature from options to tracker.track()', async () => {
    const tracker = createTracker({
      syncPrices: false,
      customPrices: { 'gpt-4o': { input: 2.5, output: 10 } },
    })
    const handler = new TokenwatchCallbackHandler(tracker, {
      sessionId: 'sess-1',
      userId: 'user-1',
      feature: 'chat',
    })
    const result: AnyResult = {
      llmOutput: { tokenUsage: { promptTokens: 100, completionTokens: 50 } },
      generations: [[{ message: { response_metadata: { model_name: 'gpt-4o' } } }]],
    }
    await handler.handleLLMEnd(result)
    const report = await tracker.getReport()
    expect(report.bySession['sess-1']).toBeDefined()
    expect(report.byUser['user-1']).toBeDefined()
    expect(report.byFeature['chat']).toBeDefined()
  })

  it('does not throw when generations array is empty', async () => {
    const tracker = createTracker({
      syncPrices: false,
      customPrices: { 'gpt-4o': { input: 2.5, output: 10 } },
    })
    const handler = new TokenwatchCallbackHandler(tracker, { defaultModel: 'gpt-4o' })
    const result: AnyResult = {
      llmOutput: { tokenUsage: { promptTokens: 100, completionTokens: 50 } },
      generations: [],
    }
    await expect(handler.handleLLMEnd(result)).resolves.toBeUndefined()
  })

  it('has the correct name property', () => {
    const tracker = createTracker({ syncPrices: false })
    const handler = new TokenwatchCallbackHandler(tracker)
    expect(handler.name).toBe('TokenwatchCallbackHandler')
  })

  it('computes correct cost using customPrices', async () => {
    const tracker = createTracker({
      syncPrices: false,
      customPrices: { 'gpt-4o': { input: 2.5, output: 10 } },
    })
    const handler = new TokenwatchCallbackHandler(tracker)
    const result: AnyResult = {
      llmOutput: { tokenUsage: { promptTokens: 1_000_000, completionTokens: 1_000_000 } },
      generations: [[{ message: { response_metadata: { model_name: 'gpt-4o' } } }]],
    }
    await handler.handleLLMEnd(result)
    const report = await tracker.getReport()
    // 1M input at $2.5 + 1M output at $10 = $12.5
    expect(report.totalCostUSD).toBeCloseTo(12.5, 5)
  })
})
