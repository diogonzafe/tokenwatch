import { describe, it, expect, vi } from 'vitest'
import { createTracker } from '../../src/core/tracker.js'
import { wrapOpenAI } from '../../src/providers/openai.js'
import { wrapAnthropic } from '../../src/providers/anthropic.js'
import { wrapGemini } from '../../src/providers/gemini.js'

describe('Full integration — create tracker → wrap → call → report', () => {
  it('multi-provider tracking accumulates correctly', async () => {
    const tracker = createTracker({ syncPrices: false })

    // OpenAI call
    const openaiClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            model: 'gpt-4o',
            usage: { prompt_tokens: 1000, completion_tokens: 500 },
          }),
        },
      },
    }
    const wrappedOpenAI = wrapOpenAI(openaiClient, tracker)
    await wrappedOpenAI.chat.completions.create({
      model: 'gpt-4o',
      messages: [],
      __sessionId: 'session-1',
      __userId: 'user-1',
    } as Record<string, unknown>)

    // Anthropic call
    const anthropicClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 500, output_tokens: 200 },
        }),
      },
    }
    const wrappedAnthropic = wrapAnthropic(anthropicClient, tracker)
    await wrappedAnthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [],
      __sessionId: 'session-1',
      __userId: 'user-1',
    } as Record<string, unknown>)

    // Gemini call
    const geminiClient = {
      getGenerativeModel: vi.fn().mockReturnValue({
        generateContent: vi.fn().mockResolvedValue({
          response: {
            usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 100 },
          },
        }),
        generateContentStream: vi.fn(),
      }),
    }
    const wrappedGemini = wrapGemini(geminiClient, tracker)
    const geminiModel = wrappedGemini.getGenerativeModel({ model: 'gemini-2.5-flash' })
    await geminiModel.generateContent('test prompt')

    const report = await tracker.getReport()

    // Total tokens: 1000+500+300 input, 500+200+100 output
    expect(report.totalTokens.input).toBe(1800)
    expect(report.totalTokens.output).toBe(800)

    // 3 distinct calls from 3 providers
    expect(Object.keys(report.byModel)).toHaveLength(3)
    expect(report.byModel['gpt-4o']?.calls).toBe(1)
    expect(report.byModel['claude-sonnet-4-6']?.calls).toBe(1)
    expect(report.byModel['gemini-2.5-flash']?.calls).toBe(1)

    // Session tracking (OpenAI + Anthropic used session-1)
    expect(report.bySession['session-1']?.calls).toBe(2)

    // User tracking
    expect(report.byUser['user-1']?.calls).toBe(2)

    // byFeature is always present (empty object when no feature tags used)
    expect(report.byFeature).toBeDefined()

    // Cost is > 0
    expect(report.totalCostUSD).toBeGreaterThan(0)
  })

  it('reset() clears everything', async () => {
    const tracker = createTracker({ syncPrices: false })
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            model: 'gpt-4o',
            usage: { prompt_tokens: 1000, completion_tokens: 500 },
          }),
        },
      },
    }
    const wrapped = wrapOpenAI(client, tracker)
    await wrapped.chat.completions.create({ model: 'gpt-4o', messages: [] })

    await tracker.reset()
    const report = await tracker.getReport()
    expect(report.totalCostUSD).toBe(0)
    expect(report.totalTokens).toEqual({ input: 0, output: 0 })
    expect(report.byModel).toEqual({})
  })

  it('byFeature accumulates across providers', async () => {
    const tracker = createTracker({ syncPrices: false })
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            model: 'gpt-4o',
            usage: { prompt_tokens: 100, completion_tokens: 50 },
          }),
        },
      },
    }
    const wrapped = wrapOpenAI(client, tracker)
    await wrapped.chat.completions.create({ model: 'gpt-4o', messages: [], __feature: 'chat' } as Record<string, unknown>)
    await wrapped.chat.completions.create({ model: 'gpt-4o', messages: [], __feature: 'chat' } as Record<string, unknown>)
    await wrapped.chat.completions.create({ model: 'gpt-4o', messages: [], __feature: 'rag' } as Record<string, unknown>)

    const report = await tracker.getReport()
    expect(report.byFeature['chat']?.calls).toBe(2)
    expect(report.byFeature['rag']?.calls).toBe(1)
    expect(report.byFeature['chat']!.costUSD).toBeGreaterThan(0)
  })

  it('exportJSON and exportCSV produce valid output', async () => {
    const tracker = createTracker({ syncPrices: false })
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            model: 'gpt-4o',
            usage: { prompt_tokens: 100, completion_tokens: 50 },
          }),
        },
      },
    }
    const wrapped = wrapOpenAI(client, tracker)
    await wrapped.chat.completions.create({ model: 'gpt-4o', messages: [] })

    const json = await tracker.exportJSON()
    const parsed = JSON.parse(json) as { totalCostUSD: number }
    expect(parsed.totalCostUSD).toBeGreaterThan(0)

    const csv = await tracker.exportCSV()
    const lines = csv.trim().split('\n')
    expect(lines[0]).toContain('model')
    expect(lines).toHaveLength(2) // header + 1 row
  })
})
