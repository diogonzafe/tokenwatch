import type { PriceMap } from '../types/index.js'
import { calculateCost } from './pricing.js'

const PROVIDER_PREFIXES = ['gpt-', 'claude-', 'gemini-', 'deepseek-'] as const

function getProviderPrefix(model: string): string | undefined {
  return PROVIDER_PREFIXES.find((p) => model.startsWith(p))
}

/**
 * After a tracked call, check if there is a cheaper model in the same provider family
 * (defined by model name prefix). Logs a hint if savings are strictly greater than 50%.
 * No-ops if the model is unknown, costUSD is zero, or no cheaper candidate is found.
 */
export function maybeSuggestCheaperModel(
  model: string,
  costUSD: number,
  inputTokens: number,
  outputTokens: number,
  layers: { bundledPrices: PriceMap; customPrices?: PriceMap; remotePrices?: PriceMap },
): void {
  if (costUSD <= 0) return

  const prefix = getProviderPrefix(model)
  if (!prefix) return

  // Merge layers: bundled < remote < custom (custom wins)
  const mergedMap: PriceMap = {
    ...layers.bundledPrices,
    ...(layers.remotePrices ?? {}),
    ...(layers.customPrices ?? {}),
  }

  let cheapestModel: string | undefined
  let cheapestCost = Infinity

  for (const key of Object.keys(mergedMap)) {
    if (key === model || !key.startsWith(prefix)) continue
    const price = mergedMap[key]
    if (!price) continue
    const candidateCost = calculateCost(inputTokens, outputTokens, price)
    if (candidateCost < cheapestCost) {
      cheapestCost = candidateCost
      cheapestModel = key
    }
  }

  // Must be strictly more than 50% cheaper
  if (cheapestModel === undefined || cheapestCost >= costUSD * 0.5) return

  const savingsPct = Math.round((1 - cheapestCost / costUSD) * 100)
  console.log(
    `[tokenwatch] Suggestion: ${cheapestModel} could handle this for ~$${cheapestCost.toFixed(4)} (${savingsPct}% cheaper than ${model})`,
  )
}
