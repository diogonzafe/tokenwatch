import { describe, it, expect } from 'vitest'
import { calculateCost } from '../../src/core/pricing.js'
import type { ModelPrice } from '../../src/types/index.js'

const GPT4O: ModelPrice = { input: 2.5, output: 10, cachedInput: 1.25 }
const CLAUDE: ModelPrice = { input: 3, output: 15, cachedInput: 0.3, cacheCreationInput: 3.75 }
const NO_CACHE: ModelPrice = { input: 2.5, output: 10 }

describe('calculateCost with cached tokens', () => {
  it('computes full input cost when no cached tokens', () => {
    const cost = calculateCost(1_000_000, 0, GPT4O)
    expect(cost).toBeCloseTo(2.5)
  })

  it('applies cachedInput price for OpenAI cached reads (50% of input)', () => {
    // 500k regular + 500k cached; no output
    const cost = calculateCost(500_000, 0, GPT4O, 500_000)
    const expected = (500_000 / 1e6) * 2.5 + (500_000 / 1e6) * 1.25
    expect(cost).toBeCloseTo(expected)
  })

  it('applies cachedInput and cacheCreationInput for Anthropic', () => {
    // 100k regular, 50k cached reads, 20k cache creation, 30k output
    const cost = calculateCost(100_000, 30_000, CLAUDE, 50_000, 20_000)
    const expected =
      (100_000 / 1e6) * 3 +
      (50_000 / 1e6) * 0.3 +
      (20_000 / 1e6) * 3.75 +
      (30_000 / 1e6) * 15
    expect(cost).toBeCloseTo(expected)
  })

  it('falls back to input price for cachedInput when not in ModelPrice', () => {
    // If no cachedInput defined, cached reads are billed at full input price
    const cost = calculateCost(500_000, 0, NO_CACHE, 500_000)
    const expected = (500_000 / 1e6) * 2.5 + (500_000 / 1e6) * 2.5
    expect(cost).toBeCloseTo(expected)
  })

  it('falls back to 1.25× input price for cacheCreationInput when not defined', () => {
    // Falls back to input * 1.25 for cache creation
    const cost = calculateCost(0, 0, NO_CACHE, 0, 1_000_000)
    const expected = (1_000_000 / 1e6) * 2.5 * 1.25
    expect(cost).toBeCloseTo(expected)
  })

  it('zero cachedTokens means no change vs regular cost', () => {
    const withZero = calculateCost(1000, 500, GPT4O, 0, 0)
    const without = calculateCost(1000, 500, GPT4O)
    expect(withZero).toBeCloseTo(without)
  })
})
