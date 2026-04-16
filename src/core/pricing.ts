import type { ModelPrice, PriceMap } from '../types/index.js'

/**
 * Resolve price for a model using 3-layer priority:
 *   1. customPrices (user override)
 *   2. remotePrices  (synced from GitHub, cached 24h)
 *   3. bundledPrices (always-present fallback)
 *
 * Falls back to zero-cost with a console warning when model is not found anywhere.
 */
export function resolvePrice(
  model: string,
  layers: {
    customPrices?: PriceMap
    remotePrices?: PriceMap
    bundledPrices: PriceMap
  },
): ModelPrice {
  const { customPrices, remotePrices, bundledPrices } = layers

  const found =
    lookupInMap(model, customPrices) ??
    lookupInMap(model, remotePrices) ??
    lookupInMap(model, bundledPrices)

  if (found) return found

  console.warn(
    `[tokenwatch] Unknown model "${model}". Cost will be recorded as $0. ` +
      `Add it via customPrices or update prices with: tokenwatch sync`,
  )
  return { input: 0, output: 0 }
}

/**
 * Look up a model in a PriceMap using:
 *   1. exact key match
 *   2. prefix match  — map key is a prefix of the model string (e.g. "gpt-4o" matches "gpt-4o-2024-11-20")
 *   3. reverse prefix — model string is a prefix of a map key (unusual, safety net)
 */
function lookupInMap(model: string, map: PriceMap | undefined): ModelPrice | undefined {
  if (!map) return undefined

  if (model in map) return map[model]

  // prefix match
  for (const key of Object.keys(map)) {
    if (model.startsWith(key) || key.startsWith(model)) {
      return map[key]
    }
  }

  return undefined
}

/**
 * Calculate cost in USD given token counts and per-million-token prices.
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  price: ModelPrice,
): number {
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output
}
