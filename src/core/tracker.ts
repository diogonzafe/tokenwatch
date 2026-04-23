import { z } from 'zod'
import type {
  Tracker,
  TrackerConfig,
  UsageEntry,
  Report,
  ReportOptions,
  CostForecast,
  ForecastOptions,
  ModelStats,
  SessionStats,
  UserStats,
  FeatureStats,
  ModelPrice,
  PriceMap,
  IStorage,
  BudgetConfig,
  IExporter,
} from '../types/index.js'
import { resolvePrice, findPrice, calculateCost } from './pricing.js'
import { maybeSuggestCheaperModel } from './suggestions.js'
import { createStorage } from './storage.js'
import { getRemotePrices } from './sync.js'
import bundledPricesFile from '../../prices.json' assert { type: 'json' }

const bundledPrices: PriceMap = bundledPricesFile.models as PriceMap
const bundledUpdatedAt: string = (bundledPricesFile as { updated_at?: string }).updated_at ?? ''

// ─── Config validation schema ─────────────────────────────────────────────────

const ModelPriceSchema = z.object({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cachedInput: z.number().nonnegative().optional(),
  cacheCreationInput: z.number().nonnegative().optional(),
  maxInputTokens: z.number().positive().optional(),
})

const BudgetConfigSchema = z.object({
  threshold: z.number().positive(),
  webhookUrl: z.string().url(),
  mode: z.enum(['once', 'always']).optional().default('once'),
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
  warnIfStaleAfterHours: z.number().nonnegative().optional().default(72),
  budgets: z.object({
    perUser: BudgetConfigSchema.optional(),
    perSession: BudgetConfigSchema.optional(),
  }).optional(),
  suggestions: z.boolean().optional().default(false),
  anomalyDetection: z.object({
    multiplierThreshold: z.number().positive(),
    webhookUrl: z.string().url(),
    windowHours: z.number().positive().optional().default(24),
    mode: z.enum(['once', 'always']).optional().default('once'),
  }).optional(),
  exporter: z.custom<IExporter>((v) => (
    v !== null &&
    typeof v === 'object' &&
    typeof (v as IExporter).export === 'function'
  )).optional(),
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
    warnIfStaleAfterHours,
    budgets,
    suggestions,
    anomalyDetection,
    exporter,
  } = parsed.data

  const storage: IStorage =
    typeof storageOption === 'object'
      ? storageOption
      : createStorage(storageOption)

  // Fetch remote prices in the background — bundled prices are used as fallback
  // until the sync resolves. Negligible overhead added to createTracker().
  let remotePrices: PriceMap | undefined
  let pricesUpdatedAt: string = bundledUpdatedAt
  if (syncPrices) {
    getRemotePrices()
      .then((result) => {
        if (result) {
          remotePrices = result.models
          pricesUpdatedAt = result.updated_at
        }
      })
      .catch(() => {
        // best-effort — bundled prices remain in use
      })
  }

  // Warn if prices are stale (checked lazily on first access)
  let stalenessChecked = false
  function maybeWarnStaleness(): void {
    if (stalenessChecked || !warnIfStaleAfterHours) return
    stalenessChecked = true
    if (!pricesUpdatedAt) return
    try {
      const updatedMs = new Date(pricesUpdatedAt).getTime()
      const ageHours = (Date.now() - updatedMs) / (1000 * 60 * 60)
      if (ageHours > warnIfStaleAfterHours) {
        console.warn(
          `[tokenwatch] Price data is ${Math.round(ageHours)}h old (updated_at: ${pricesUpdatedAt}). ` +
            `Run "tokenwatch sync" to refresh, or set warnIfStaleAfterHours: 0 to suppress.`,
        )
      }
    } catch {
      // best-effort
    }
  }

  let alertFired = false
  const firedUserAlerts = new Set<string>()
  const firedSessionAlerts = new Set<string>()
  const firedAnomalyKeys = new Set<string>()
  const startedAt = new Date().toISOString()

  function resolveModelPrice(model: string) {
    maybeWarnStaleness()
    return resolvePrice(model, {
      bundledPrices,
      ...(customPrices !== undefined && { customPrices: customPrices as PriceMap }),
      ...(remotePrices !== undefined && { remotePrices }),
    })
  }

  function track(entry: Omit<UsageEntry, 'costUSD' | 'timestamp'>): void {
    const price = resolveModelPrice(entry.model)
    const costUSD = calculateCost(
      entry.inputTokens,
      entry.outputTokens,
      price,
      entry.cachedTokens,
      entry.cacheCreationTokens,
    )
    const full: UsageEntry = {
      ...entry,
      costUSD,
      timestamp: new Date().toISOString(),
    }
    storage.record(full)
    if (exporter) {
      Promise.resolve(exporter.export(full)).catch(() => { /* fire-and-forget */ })
    }
    maybeFireAlerts(full)
    if (anomalyDetection) maybeDetectAnomaly(full)
    if (suggestions) {
      maybeSuggestCheaperModel(entry.model, costUSD, entry.inputTokens, entry.outputTokens, {
        bundledPrices,
        ...(customPrices !== undefined && { customPrices: customPrices as PriceMap }),
        ...(remotePrices !== undefined && { remotePrices }),
      })
    }
  }

  function maybeFireAlerts(entry: UsageEntry): void {
    // Global threshold alert
    if (alertThreshold && webhookUrl && !alertFired) {
      alertFired = true
      Promise.resolve(storage.getAll()).then((entries) => {
        const total = computeTotal(entries)
        if (total < alertThreshold!) {
          alertFired = false
          return
        }
        fireWebhook(webhookUrl!, {
          text: `[tokenwatch] Alert: total cost reached $${total.toFixed(4)} USD (threshold: $${alertThreshold})`,
        })
      }).catch(() => {
        alertFired = false
      })
    }

    // Per-user budget alert
    if (budgets?.perUser && entry.userId) {
      const cfg = budgets.perUser
      const uid = entry.userId
      if (cfg.mode === 'always' || !firedUserAlerts.has(uid)) {
        // Claim the slot synchronously before going async — prevents double-fire
        if (cfg.mode !== 'always') firedUserAlerts.add(uid)
        Promise.resolve(storage.getAll()).then((entries) => {
          const userCost = entries
            .filter((e) => e.userId === uid)
            .reduce((s, e) => s + e.costUSD, 0)
          if (userCost >= cfg.threshold) {
            fireWebhook(cfg.webhookUrl, {
              text: `[tokenwatch] Budget alert: user "${uid}" reached $${userCost.toFixed(4)} USD (threshold: $${cfg.threshold})`,
            })
          } else {
            if (cfg.mode !== 'always') firedUserAlerts.delete(uid) // release — threshold not yet met
          }
        }).catch(() => {
          if (cfg.mode !== 'always') firedUserAlerts.delete(uid) // release on storage error
        })
      }
    }

    // Per-session budget alert
    if (budgets?.perSession && entry.sessionId) {
      const cfg = budgets.perSession
      const sid = entry.sessionId
      if (cfg.mode === 'always' || !firedSessionAlerts.has(sid)) {
        // Claim the slot synchronously before going async — prevents double-fire
        if (cfg.mode !== 'always') firedSessionAlerts.add(sid)
        Promise.resolve(storage.getAll()).then((entries) => {
          const sessionCost = entries
            .filter((e) => e.sessionId === sid)
            .reduce((s, e) => s + e.costUSD, 0)
          if (sessionCost >= cfg.threshold) {
            fireWebhook(cfg.webhookUrl, {
              text: `[tokenwatch] Budget alert: session "${sid}" reached $${sessionCost.toFixed(4)} USD (threshold: $${cfg.threshold})`,
            })
          } else {
            if (cfg.mode !== 'always') firedSessionAlerts.delete(sid) // release
          }
        }).catch(() => {
          if (cfg.mode !== 'always') firedSessionAlerts.delete(sid) // release on storage error
        })
      }
    }
  }

  function fireWebhook(url: string, payload: { text: string }): void {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {
      // fire-and-forget
    })
  }

  async function getReport(options?: ReportOptions): Promise<Report> {
    const allEntries = await Promise.resolve(storage.getAll())
    const entries = filterEntries(allEntries, options)

    const byModel: Record<string, ModelStats> = {}
    const bySession: Record<string, SessionStats> = {}
    const byUser: Record<string, UserStats> = {}
    const byFeature: Record<string, FeatureStats> = {}

    let totalInput = 0
    let totalOutput = 0
    let totalCost = 0
    let periodFrom = options ? (entries[0]?.timestamp ?? startedAt) : startedAt
    let lastTimestamp = periodFrom

    for (const e of entries) {
      totalInput += e.inputTokens + (e.cachedTokens ?? 0) + (e.cacheCreationTokens ?? 0)
      totalOutput += e.outputTokens
      totalCost += e.costUSD
      if (e.timestamp > lastTimestamp) lastTimestamp = e.timestamp

      // byModel
      const m = (byModel[e.model] ??= {
        costUSD: 0,
        calls: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cached: 0 },
      })
      m.costUSD += e.costUSD
      m.calls += 1
      m.tokens.input += e.inputTokens + (e.cachedTokens ?? 0) + (e.cacheCreationTokens ?? 0)
      m.tokens.output += e.outputTokens
      m.tokens.reasoning += e.reasoningTokens ?? 0
      m.tokens.cached += e.cachedTokens ?? 0

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

      // byFeature
      if (e.feature) {
        const f = (byFeature[e.feature] ??= { costUSD: 0, calls: 0 })
        f.costUSD += e.costUSD
        f.calls += 1
      }
    }

    // When filtering, use the actual first entry's timestamp as period.from
    if (options && entries.length > 0) {
      periodFrom = entries[0]?.timestamp ?? periodFrom
    }

    return {
      totalCostUSD: totalCost,
      totalTokens: { input: totalInput, output: totalOutput },
      byModel,
      bySession,
      byUser,
      byFeature,
      period: { from: periodFrom, to: lastTimestamp },
      ...(pricesUpdatedAt ? { pricesUpdatedAt } : {}),
    }
  }

  async function getCostForecast(options: ForecastOptions = {}): Promise<CostForecast> {
    const windowHours = options.windowHours ?? 24
    const allEntries = await Promise.resolve(storage.getAll())

    const now = Date.now()
    const windowStart = now - windowHours * 60 * 60 * 1000
    const windowEntries = allEntries.filter(
      (e) => new Date(e.timestamp).getTime() >= windowStart,
    )

    if (windowEntries.length < 2) {
      return {
        burnRatePerHour: 0,
        projectedDailyCostUSD: 0,
        projectedMonthlyCostUSD: 0,
        basedOnHours: 0,
        basedOnPeriod: null,
      }
    }

    const first = windowEntries[0]?.timestamp ?? ''
    const last = windowEntries[windowEntries.length - 1]?.timestamp ?? ''
    const actualMs = new Date(last).getTime() - new Date(first).getTime()
    const actualHours = actualMs / (1000 * 60 * 60)

    if (actualHours < 0.001) {
      return {
        burnRatePerHour: 0,
        projectedDailyCostUSD: 0,
        projectedMonthlyCostUSD: 0,
        basedOnHours: 0,
        basedOnPeriod: { from: first, to: last },
      }
    }

    const totalCost = windowEntries.reduce((s, e) => s + e.costUSD, 0)
    const burnRatePerHour = totalCost / actualHours

    return {
      burnRatePerHour,
      projectedDailyCostUSD: burnRatePerHour * 24,
      projectedMonthlyCostUSD: burnRatePerHour * 24 * 30,
      basedOnHours: Math.round(actualHours * 100) / 100,
      basedOnPeriod: { from: first, to: last },
    }
  }

  function maybeDetectAnomaly(entry: UsageEntry): void {
    if (entry.costUSD <= 0) return
    const { multiplierThreshold, webhookUrl: aUrl, windowHours: wh, mode: modeRaw } = anomalyDetection!
    const wHours = wh ?? 24
    const mode = modeRaw ?? 'once'
    const windowStart = Date.now() - wHours * 60 * 60 * 1000
    const entryTs = new Date(entry.timestamp).getTime()

    function checkEntity(key: string, label: string, predicate: (e: UsageEntry) => boolean): void {
      if (mode !== 'always' && firedAnomalyKeys.has(key)) return
      if (mode !== 'always') firedAnomalyKeys.add(key)
      Promise.resolve(storage.getAll()).then((all) => {
        const history = all.filter(
          (e) =>
            predicate(e) &&
            new Date(e.timestamp).getTime() >= windowStart &&
            new Date(e.timestamp).getTime() !== entryTs,
        )
        if (history.length === 0) {
          if (mode !== 'always') firedAnomalyKeys.delete(key)
          return
        }
        const avg = history.reduce((s, e) => s + e.costUSD, 0) / history.length
        if (avg <= 0 || entry.costUSD <= avg * multiplierThreshold) {
          if (mode !== 'always') firedAnomalyKeys.delete(key)
          return
        }
        const multiple = (entry.costUSD / avg).toFixed(1)
        fireWebhook(aUrl, {
          text: `[tokenwatch] Anomaly: ${label} call cost $${entry.costUSD.toFixed(4)} is ${multiple}x above ${wHours}h average ($${avg.toFixed(4)})`,
        })
      }).catch(() => {
        if (mode !== 'always') firedAnomalyKeys.delete(key)
      })
    }

    if (entry.userId) {
      checkEntity(
        `user:${entry.userId}`,
        `user "${entry.userId}"`,
        (e) => e.userId === entry.userId,
      )
    }
    checkEntity(
      `model:${entry.model}`,
      `model "${entry.model}"`,
      (e) => e.model === entry.model,
    )
  }

  async function reset(): Promise<void> {
    await Promise.resolve(storage.clearAll())
    alertFired = false
    firedUserAlerts.clear()
    firedSessionAlerts.clear()
    firedAnomalyKeys.clear()
  }

  async function resetSession(sessionId: string): Promise<void> {
    await Promise.resolve(storage.clearSession(sessionId))
    firedSessionAlerts.delete(sessionId)
  }

  async function exportJSON(): Promise<string> {
    return JSON.stringify(await getReport(), null, 2)
  }

  async function exportCSV(): Promise<string> {
    const entries = await Promise.resolve(storage.getAll())
    const header =
      'timestamp,model,inputTokens,outputTokens,reasoningTokens,cachedTokens,cacheCreationTokens,costUSD,sessionId,userId,feature'
    const rows = entries.map((e) =>
      [
        csvEscape(e.timestamp),
        csvEscape(e.model),
        e.inputTokens,
        e.outputTokens,
        e.reasoningTokens ?? 0,
        e.cachedTokens ?? 0,
        e.cacheCreationTokens ?? 0,
        e.costUSD.toFixed(8),
        csvEscape(e.sessionId ?? ''),
        csvEscape(e.userId ?? ''),
        csvEscape(e.feature ?? ''),
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

  return {
    track,
    getReport,
    getCostForecast,
    reset,
    resetSession,
    exportJSON,
    exportCSV,
    getModelInfo,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeTotal(entries: UsageEntry[]): number {
  return entries.reduce((sum, e) => sum + e.costUSD, 0)
}

/** Parse a 'last' shorthand like '24h', '7d' into milliseconds */
function parseLastMs(last: string): number {
  const match = /^(\d+(?:\.\d+)?)(h|d)$/.exec(last.trim())
  if (!match) throw new Error(`[tokenwatch] Invalid "last" value: "${last}". Use e.g. "24h", "7d".`)
  const value = parseFloat(match[1] ?? '0')
  const unit = match[2] ?? 'h'
  return unit === 'h' ? value * 60 * 60 * 1000 : value * 24 * 60 * 60 * 1000
}

function filterEntries(entries: UsageEntry[], options?: ReportOptions): UsageEntry[] {
  if (!options) return entries

  let sinceMs: number | undefined
  let untilMs: number | undefined

  if (options.last) {
    sinceMs = Date.now() - parseLastMs(options.last)
  } else if (options.since) {
    sinceMs = new Date(options.since).getTime()
  }
  if (options.until) {
    untilMs = new Date(options.until).getTime()
  }

  if (sinceMs === undefined && untilMs === undefined) return entries

  return entries.filter((e) => {
    const ts = new Date(e.timestamp).getTime()
    if (sinceMs !== undefined && ts < sinceMs) return false
    if (untilMs !== undefined && ts > untilMs) return false
    return true
  })
}

/** Wrap a CSV field value in double-quotes if it contains commas, quotes, or newlines. */
function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
