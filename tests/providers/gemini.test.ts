import { describe, it, expect, vi } from 'vitest'
import { wrapGemini } from '../../src/providers/gemini.js'
import { createTracker } from '../../src/core/tracker.js'

function makeTracker() {
  return createTracker({ syncPrices: false })
}

function makeGeminiClient() {
  const generateContentFn = vi.fn().mockResolvedValue({
    response: {
      usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 35 },
    },
  })

  const generateContentStreamFn = vi.fn().mockResolvedValue({
    stream: (async function* () {
      yield { text: 'Hello' }
    })(),
    response: Promise.resolve({
      usageMetadata: { promptTokenCount: 90, candidatesTokenCount: 45 },
    }),
  })

  const getGenerativeModelFn = vi.fn().mockReturnValue({
    generateContent: generateContentFn,
    generateContentStream: generateContentStreamFn,
  })

  return {
    getGenerativeModel: getGenerativeModelFn,
    _generateContentFn: generateContentFn,
    _generateContentStreamFn: generateContentStreamFn,
  }
}

describe('wrapGemini', () => {
  it('records usage from generateContent', async () => {
    const tracker = makeTracker()
    const client = makeGeminiClient()
    const wrapped = wrapGemini(client, tracker)

    const model = wrapped.getGenerativeModel({ model: 'gemini-2.5-flash' })
    await model.generateContent('Hello')

    const report = await tracker.getReport()
    expect(report.totalTokens.input).toBe(80)
    expect(report.totalTokens.output).toBe(35)
  })

  it('records model name correctly', async () => {
    const tracker = makeTracker()
    const client = makeGeminiClient()
    const wrapped = wrapGemini(client, tracker)

    const model = wrapped.getGenerativeModel({ model: 'gemini-2.5-pro' })
    await model.generateContent('Hello')

    const report = await tracker.getReport()
    expect(report.byModel['gemini-2.5-pro']).toBeDefined()
  })

  it('does NOT record cost when generateContent throws', async () => {
    const tracker = makeTracker()
    const errorClient = {
      getGenerativeModel: vi.fn().mockReturnValue({
        generateContent: vi.fn().mockRejectedValue(new Error('API error')),
        generateContentStream: vi.fn(),
      }),
    }
    const wrapped = wrapGemini(errorClient, tracker)

    const model = wrapped.getGenerativeModel({ model: 'gemini-2.5-flash' })
    await expect(model.generateContent('Hello')).rejects.toThrow('API error')
    expect((await tracker.getReport()).totalCostUSD).toBe(0)
  })

  it('strips __sessionId, __userId and __feature before passing to getGenerativeModel', async () => {
    const tracker = makeTracker()
    const client = makeGeminiClient()
    const wrapped = wrapGemini(client, tracker)

    wrapped.getGenerativeModel({
      model: 'gemini-2.5-flash',
      __sessionId: 'sess-1',
      __userId: 'user-1',
      __feature: 'rag',
    } as Record<string, unknown>)

    const callArgs = client.getGenerativeModel.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArgs).not.toHaveProperty('__sessionId')
    expect(callArgs).not.toHaveProperty('__userId')
    expect(callArgs).not.toHaveProperty('__feature')
  })

  it('records sessionId, userId and feature from getGenerativeModel params', async () => {
    const tracker = makeTracker()
    const client = makeGeminiClient()
    const wrapped = wrapGemini(client, tracker)

    const model = wrapped.getGenerativeModel({
      model: 'gemini-2.5-flash',
      __sessionId: 'gemini-sess',
      __userId: 'gemini-user',
      __feature: 'rag',
    } as Record<string, unknown>)
    await model.generateContent('Hello')

    const report = await tracker.getReport()
    expect(report.bySession['gemini-sess']).toBeDefined()
    expect(report.byUser['gemini-user']).toBeDefined()
    expect(report.byFeature['rag']).toBeDefined()
    expect(report.byFeature['rag']?.calls).toBe(1)
  })

  it('records usage from generateContentStream via response promise', async () => {
    const tracker = makeTracker()
    const client = makeGeminiClient()
    const wrapped = wrapGemini(client, tracker)

    const model = wrapped.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContentStream('Hello')

    // Consume stream
    for await (const _ of result.stream) {
      // consume
    }
    // Wait for response promise
    await result.response

    // Allow microtask to flush
    await new Promise((r) => setTimeout(r, 0))

    const report = await tracker.getReport()
    expect(report.totalTokens.input).toBe(90)
    expect(report.totalTokens.output).toBe(45)
  })
})
