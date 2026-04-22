import { describe, it, expect, vi, afterEach } from 'vitest'
import { maybeSuggestCheaperModel } from '../../src/core/suggestions.js'
import { createTracker } from '../../src/core/tracker.js'

afterEach(() => {
  vi.restoreAllMocks()
})

// Controlled layers with only the models we specify — no bundled prices interference
const LAYERS_GPT = {
  bundledPrices: {
    'gpt-4o': { input: 2.5, output: 10 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
  },
}

describe('maybeSuggestCheaperModel() — unit', () => {
  it('logs a suggestion when a cheaper model in the same family exists (>50% savings)', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    // gpt-4o costs 2.5/M input + 10/M output; gpt-4o-mini costs 0.15/M + 0.6/M → ~96% cheaper
    const costUSD = (100_000 / 1_000_000) * 2.5 + (10_000 / 1_000_000) * 10
    maybeSuggestCheaperModel('gpt-4o', costUSD, 100_000, 10_000, LAYERS_GPT)
    expect(spy).toHaveBeenCalledOnce()
    const msg = spy.mock.calls[0]?.[0] as string
    expect(msg).toContain('gpt-4o-mini')
    expect(msg).toContain('gpt-4o')
    expect(msg).toMatch(/\d+%/)
  })

  it('does not suggest when model is already cheapest in family', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const costUSD = (100_000 / 1_000_000) * 0.15 + (10_000 / 1_000_000) * 0.6
    maybeSuggestCheaperModel('gpt-4o-mini', costUSD, 100_000, 10_000, LAYERS_GPT)
    expect(spy).not.toHaveBeenCalled()
  })

  it('does not suggest for unknown model (not in any provider family prefix)', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    maybeSuggestCheaperModel('my-custom-llm', 0.05, 100_000, 10_000, {
      bundledPrices: { 'my-custom-llm': { input: 5, output: 20 } },
    })
    expect(spy).not.toHaveBeenCalled()
  })

  it('does not suggest when savings are exactly 50%', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    // gpt-4o-half costs exactly 50% of gpt-4o for any token count with same input/output ratio
    const layers = {
      bundledPrices: {
        'gpt-4o': { input: 2.0, output: 10.0 },
        'gpt-4o-half': { input: 1.0, output: 5.0 }, // exactly 50% cheaper
      },
    }
    const costUSD = (100_000 / 1_000_000) * 2.0 + (100_000 / 1_000_000) * 10.0
    maybeSuggestCheaperModel('gpt-4o', costUSD, 100_000, 100_000, layers)
    expect(spy).not.toHaveBeenCalled()
  })

  it('suggests when savings are strictly above 50%', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const costUSD = (100_000 / 1_000_000) * 2.5 + (10_000 / 1_000_000) * 10
    maybeSuggestCheaperModel('gpt-4o', costUSD, 100_000, 10_000, LAYERS_GPT)
    expect(spy).toHaveBeenCalledOnce()
  })

  it('does not suggest when costUSD is 0', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    maybeSuggestCheaperModel('gpt-4o', 0, 100_000, 10_000, LAYERS_GPT)
    expect(spy).not.toHaveBeenCalled()
  })

  it('suggests the cheapest candidate, not just any cheaper one', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const layers = {
      bundledPrices: {
        'gpt-4o': { input: 10, output: 40 },
        'gpt-4o-medium': { input: 4, output: 16 }, // 60% cheaper
        'gpt-4o-mini': { input: 0.15, output: 0.6 }, // 98% cheaper — should be suggested
      },
    }
    const costUSD = (100_000 / 1_000_000) * 10 + (10_000 / 1_000_000) * 40
    maybeSuggestCheaperModel('gpt-4o', costUSD, 100_000, 10_000, layers)
    expect(spy).toHaveBeenCalledOnce()
    const msg = spy.mock.calls[0]?.[0] as string
    expect(msg).toContain('gpt-4o-mini')
    expect(msg).not.toContain('gpt-4o-medium')
  })

  it('picks from customPrices when it has a cheaper model in same family', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const layers = {
      bundledPrices: { 'claude-sonnet-4-6': { input: 3, output: 15 } },
      customPrices: { 'claude-haiku-cheap': { input: 0.25, output: 1.25 } }, // custom model, ~92% cheaper
    }
    const costUSD = (100_000 / 1_000_000) * 3 + (10_000 / 1_000_000) * 15
    maybeSuggestCheaperModel('claude-sonnet-4-6', costUSD, 100_000, 10_000, layers)
    expect(spy).toHaveBeenCalledOnce()
    const msg = spy.mock.calls[0]?.[0] as string
    expect(msg).toContain('claude-haiku-cheap')
  })
})

describe('suggestions via createTracker() — integration', () => {
  it('does not log when suggestions: false (default)', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const tracker = createTracker({
      syncPrices: false,
      customPrices: { 'gpt-4o': { input: 2.5, output: 10 } },
    })
    tracker.track({ model: 'gpt-4o', inputTokens: 100_000, outputTokens: 10_000 })
    expect(spy).not.toHaveBeenCalled()
  })

  it('logs a suggestion when suggestions: true and a cheaper model exists', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    // claude-sonnet-4-6 is expensive; bundled prices have cheaper claude-* models
    const tracker = createTracker({ syncPrices: false, suggestions: true })
    tracker.track({ model: 'claude-sonnet-4-6', inputTokens: 10_000_000, outputTokens: 1_000_000 })
    expect(spy).toHaveBeenCalled()
    const msg = spy.mock.calls[0]?.[0] as string
    expect(msg).toContain('[tokenwatch] Suggestion:')
    expect(msg).toContain('claude-')
  })
})
