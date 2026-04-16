import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolvePrice, calculateCost } from '../../src/core/pricing.js'
import type { PriceMap } from '../../src/types/index.js'

const bundled: PriceMap = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'claude-sonnet-4-6': { input: 3.0, output: 15 },
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolvePrice', () => {
  it('exact match in bundled', () => {
    const price = resolvePrice('gpt-4o', { bundledPrices: bundled })
    expect(price).toEqual({ input: 2.5, output: 10 })
  })

  it('prefix match — "gpt-4o-2024-11-20" resolves via "gpt-4o"', () => {
    const price = resolvePrice('gpt-4o-2024-11-20', { bundledPrices: bundled })
    expect(price).toEqual({ input: 2.5, output: 10 })
  })

  it('customPrices takes priority over bundled', () => {
    const custom: PriceMap = { 'gpt-4o': { input: 99, output: 99 } }
    const price = resolvePrice('gpt-4o', { customPrices: custom, bundledPrices: bundled })
    expect(price).toEqual({ input: 99, output: 99 })
  })

  it('remotePrices takes priority over bundled, but not custom', () => {
    const remote: PriceMap = { 'gpt-4o': { input: 50, output: 50 } }
    const custom: PriceMap = { 'gpt-4o': { input: 99, output: 99 } }

    const withRemote = resolvePrice('gpt-4o', { remotePrices: remote, bundledPrices: bundled })
    expect(withRemote).toEqual({ input: 50, output: 50 })

    const withCustomAndRemote = resolvePrice('gpt-4o', {
      customPrices: custom,
      remotePrices: remote,
      bundledPrices: bundled,
    })
    expect(withCustomAndRemote).toEqual({ input: 99, output: 99 })
  })

  it('unknown model returns zero cost and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const price = resolvePrice('unknown-model-xyz', { bundledPrices: bundled })
    expect(price).toEqual({ input: 0, output: 0 })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown-model-xyz'))
  })
})

describe('calculateCost', () => {
  it('calculates cost correctly per million tokens', () => {
    // 1000 input @ $2.50/M + 500 output @ $10/M
    const cost = calculateCost(1000, 500, { input: 2.5, output: 10 })
    expect(cost).toBeCloseTo((1000 / 1_000_000) * 2.5 + (500 / 1_000_000) * 10)
  })

  it('returns 0 for zero tokens', () => {
    expect(calculateCost(0, 0, { input: 2.5, output: 10 })).toBe(0)
  })

  it('returns 0 when price is zero (unknown model fallback)', () => {
    expect(calculateCost(100_000, 50_000, { input: 0, output: 0 })).toBe(0)
  })
})
