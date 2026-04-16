import { z } from 'zod'
import type {
  Tracker,
  TrackerConfig,
  UsageEntry,
  Report,
  ModelStats,
  SessionStats,
  UserStats,
  ModelPrice,
  PriceMap,
} from '../types/index.js'
import { resolvePrice, findPrice, calculateCost } from './pricing.js'
import { createStorage } from './storage.js'
import { getRemotePrices } from './sync.js'
import bundledPricesFile from '../../prices.json' assert { type: 'json' }

const bundledPrices: PriceMap = bundledPricesFile.models as PriceMap

// ─── Config validation schema ─────────────────────────────────────────────────

const ModelPriceSchema = z.object({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  maxInputTokens: z.number().positive().optional(),
})

const TrackerConfigSchema = z.object({
  storage: z.enum(['memory', 'sqlite']).optional().default('memory'),
  alertThreshold: z.number().positive().optional(),
  webhookUrl: z.string().url().optional(),
  syncPrices: z.boolean().optional().default(true),
  customPrices: z.record(z.string(), ModelPriceSchema).optional(),
})

export function createTracker(config: TrackerConfig = {}): Tracker {
  const parsed = TrackerConfigSchema.safeParse(config)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`[tokenwatch] Invalid config:\n${issues}`)
  }

  const {
    storage: storageType,
    alertThreshold,
    webhookUrl,
    syncPrices,
    customPrices,
  } = parsed.data

  const storage = createStorage(storageType)

  // Fetch remote prices in the background — bundled prices are used as fallback
  // until the sync resolves. Zero latency added to createTracker().
  let remotePrices: PriceMap | undefined
  if (syncPrices) {
    getRemotePrices()
      .then((result) => {
        if (result) remotePrices = result
      })
      .catch(() => {
        // best-effort — bundled prices remain in use
      })
  }

  let alertFired = false
  const startedAt = new Date().toISOString()

  function resolveModelPrice(model: string) {
    return resolvePrice(model, {
      bundledPrices,
      ...(customPrices !== undefined && { customPrices: customPrices as PriceMap }),
      ...(remotePrices !== undefined && { remotePrices }),
    })
  }

  function track(entry: Omit<UsageEntry, 'costUSD' | 'timestamp'>): void {
    const price = resolveModelPrice(entry.model)
    const costUSD = calculateCost(entry.inputTokens, entry.outputTokens, price)
    const full: UsageEntry = {
      ...entry,
      costUSD,
      timestamp: new Date().toISOString(),
    }
    storage.record(full)
    maybeFireAlert()
  }

  function maybeFireAlert(): void {
    if (!alertThreshold || !webhookUrl || alertFired) return
    const total = computeTotal(storage.getAll())
    if (total >= alertThreshold) {
      alertFired = true
      const payload = {
        text: `[tokenwatch] Alert: total cost reached $${total.toFixed(4)} USD (threshold: $${alertThreshold})`,
      }
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {
        // fire-and-forget
      })
    }
  }

  function getReport(): Report {
    const entries = storage.getAll()
    const byModel: Record<string, ModelStats> = {}
    const bySession: Record<string, SessionStats> = {}
    const byUser: Record<string, UserStats> = {}

    let totalInput = 0
    let totalOutput = 0
    let totalCost = 0
    let lastTimestamp = startedAt

    for (const e of entries) {
      totalInput += e.inputTokens
      totalOutput += e.outputTokens
      totalCost += e.costUSD
      if (e.timestamp > lastTimestamp) lastTimestamp = e.timestamp

      // byModel
      const m = (byModel[e.model] ??= { costUSD: 0, calls: 0, tokens: { input: 0, output: 0 } })
      m.costUSD += e.costUSD
      m.calls += 1
      m.tokens.input += e.inputTokens
      m.tokens.output += e.outputTokens

      // bySession
      if (e.sessionId) {
        const s = (bySession[e.sessionId] ??= { costUSD: 0, calls: 0 })
        s.costUSD += e.costUSD
        s.calls += 1
      }

      // byUser
      if (e.userId) {
        const u = (byUser[e.userId] ??= { costUSD: 0, calls: 0 })
        u.costUSD += e.costUSD
        u.calls += 1
      }
    }

    return {
      totalCostUSD: totalCost,
      totalTokens: { input: totalInput, output: totalOutput },
      byModel,
      bySession,
      byUser,
      period: { from: startedAt, to: lastTimestamp },
    }
  }

  function reset(): void {
    storage.clearAll()
    alertFired = false
  }

  function resetSession(sessionId: string): void {
    storage.clearSession(sessionId)
  }

  function exportJSON(): string {
    return JSON.stringify(getReport(), null, 2)
  }

  function exportCSV(): string {
    const entries = storage.getAll()
    const header = 'timestamp,model,inputTokens,outputTokens,costUSD,sessionId,userId'
    const rows = entries.map((e) =>
      [
        e.timestamp,
        e.model,
        e.inputTokens,
        e.outputTokens,
        e.costUSD.toFixed(8),
        e.sessionId ?? '',
        e.userId ?? '',
      ].join(','),
    )
    return [header, ...rows].join('\n')
  }

  function getModelInfo(model: string): ModelPrice | null {
    return findPrice(model, {
      bundledPrices,
      ...(customPrices !== undefined && { customPrices: customPrices as PriceMap }),
      ...(remotePrices !== undefined && { remotePrices }),
    }) ?? null
  }

  return { track, getReport, reset, resetSession, exportJSON, exportCSV, getModelInfo }
}

function computeTotal(entries: UsageEntry[]): number {
  return entries.reduce((sum, e) => sum + e.costUSD, 0)
}
