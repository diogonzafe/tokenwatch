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
  IStorage,
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

// storage can be a string enum or an IStorage instance — validated separately
const TrackerConfigSchema = z.object({
  storage: z.union([z.enum(['memory', 'sqlite']), z.custom<IStorage>((v) => {
    return (
      v !== null &&
      typeof v === 'object' &&
      typeof (v as IStorage).record === 'function' &&
      typeof (v as IStorage).getAll === 'function' &&
      typeof (v as IStorage).clearAll === 'function' &&
      typeof (v as IStorage).clearSession === 'function'
    )
  })]).optional().default('memory'),
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
    storage: storageOption,
    alertThreshold,
    webhookUrl,
    syncPrices,
    customPrices,
  } = parsed.data

  const storage: IStorage =
    typeof storageOption === 'object'
      ? storageOption
      : createStorage(storageOption)

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
    // Claim the slot before going async — prevents double-fire when two
    // track() calls happen before the first Promise resolves.
    alertFired = true
    Promise.resolve(storage.getAll()).then((entries) => {
      const total = computeTotal(entries)
      if (total < alertThreshold!) {
        alertFired = false // threshold not yet reached — release the slot
        return
      }
      const payload = {
        text: `[tokenwatch] Alert: total cost reached $${total.toFixed(4)} USD (threshold: $${alertThreshold})`,
      }
      fetch(webhookUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {
        // fire-and-forget
      })
    }).catch(() => {
      alertFired = false // best-effort — release slot on storage error
    })
  }

  async function getReport(): Promise<Report> {
    const entries = await Promise.resolve(storage.getAll())
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

  async function reset(): Promise<void> {
    await Promise.resolve(storage.clearAll())
    alertFired = false
  }

  async function resetSession(sessionId: string): Promise<void> {
    await Promise.resolve(storage.clearSession(sessionId))
  }

  async function exportJSON(): Promise<string> {
    return JSON.stringify(await getReport(), null, 2)
  }

  async function exportCSV(): Promise<string> {
    const entries = await Promise.resolve(storage.getAll())
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
