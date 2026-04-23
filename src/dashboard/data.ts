import type {
  IStorage,
  UsageEntry,
  Report,
  CostForecast,
  ModelStats,
  SessionStats,
  UserStats,
  FeatureStats,
} from '../types/index.js'

export interface TimeSeriesBucket {
  bucket: string
  cost: number
  calls: number
}

export interface DashboardData {
  report: Report
  forecast: CostForecast
  timeSeries: TimeSeriesBucket[]
  lastUpdated: string
}

/**
 * Maps a filter string to a Unix ms timestamp (entries before this are excluded).
 * Returns undefined for 'all' or undefined (no filter).
 */
export function parseSince(filter: string | undefined): number | undefined {
  if (!filter || filter === 'all') return undefined
  const now = Date.now()
  switch (filter) {
    case '1h':  return now - 60 * 60 * 1000
    case '24h': return now - 24 * 60 * 60 * 1000
    case '7d':  return now - 7 * 24 * 60 * 60 * 1000
    case '30d': return now - 30 * 24 * 60 * 60 * 1000
    default:    return undefined
  }
}

/**
 * Groups entries into time-series buckets.
 * Bucket size: 1h window → 5min, 24h window → 1h, 7d/30d/all → 1day.
 */
export function buildTimeSeries(
  entries: UsageEntry[],
  sinceMs: number | undefined,
): TimeSeriesBucket[] {
  const now = Date.now()
  const windowMs = sinceMs !== undefined ? now - sinceMs : undefined

  let bucketMs: number
  if (windowMs !== undefined && windowMs <= 60 * 60 * 1000) {
    bucketMs = 5 * 60 * 1000           // 5-min buckets for ≤1h window
  } else if (windowMs !== undefined && windowMs <= 24 * 60 * 60 * 1000) {
    bucketMs = 60 * 60 * 1000          // 1h buckets for ≤24h window
  } else {
    bucketMs = 24 * 60 * 60 * 1000    // 1-day buckets for 7d/30d/all
  }

  const filtered = sinceMs !== undefined
    ? entries.filter((e) => new Date(e.timestamp).getTime() >= sinceMs)
    : entries

  const buckets = new Map<string, TimeSeriesBucket>()

  for (const entry of filtered) {
    const ts = new Date(entry.timestamp).getTime()
    const bucketTs = Math.floor(ts / bucketMs) * bucketMs
    const bucketKey = new Date(bucketTs).toISOString()
    const existing = buckets.get(bucketKey)
    if (existing) {
      existing.cost += entry.costUSD
      existing.calls += 1
    } else {
      buckets.set(bucketKey, { bucket: bucketKey, cost: entry.costUSD, calls: 1 })
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.bucket.localeCompare(b.bucket))
}

export function getFingerprint(data: DashboardData): string {
  return `${data.report.totalCostUSD.toFixed(8)}-${data.report.totalTokens.input}-${data.timeSeries.length}`
}

export async function getDashboardData(
  storage: IStorage,
  filter?: string,
): Promise<DashboardData> {
  const allEntries = await Promise.resolve(storage.getAll())
  const sinceMs = parseSince(filter)

  const entries = sinceMs !== undefined
    ? allEntries.filter((e) => new Date(e.timestamp).getTime() >= sinceMs)
    : allEntries

  // ── Build report ────────────────────────────────────────────────────────────
  const byModel: Record<string, ModelStats> = {}
  const bySession: Record<string, SessionStats> = {}
  const byUser: Record<string, UserStats> = {}
  const byFeature: Record<string, FeatureStats> = {}
  let totalInput = 0
  let totalOutput = 0
  let totalCost = 0

  for (const e of entries) {
    totalInput += e.inputTokens + (e.cachedTokens ?? 0) + (e.cacheCreationTokens ?? 0)
    totalOutput += e.outputTokens
    totalCost += e.costUSD

    const m = (byModel[e.model] ??= {
      costUSD: 0, calls: 0, tokens: { input: 0, output: 0, reasoning: 0, cached: 0 },
    })
    m.costUSD += e.costUSD
    m.calls += 1
    m.tokens.input += e.inputTokens + (e.cachedTokens ?? 0) + (e.cacheCreationTokens ?? 0)
    m.tokens.output += e.outputTokens
    m.tokens.reasoning += e.reasoningTokens ?? 0
    m.tokens.cached += e.cachedTokens ?? 0

    if (e.sessionId) {
      const s = (bySession[e.sessionId] ??= { costUSD: 0, calls: 0 })
      s.costUSD += e.costUSD
      s.calls += 1
    }

    if (e.userId) {
      const u = (byUser[e.userId] ??= { costUSD: 0, calls: 0 })
      u.costUSD += e.costUSD
      u.calls += 1
    }

    if (e.feature) {
      const f = (byFeature[e.feature] ??= { costUSD: 0, calls: 0 })
      f.costUSD += e.costUSD
      f.calls += 1
    }
  }

  const now = new Date().toISOString()
  const periodFrom = entries[0]?.timestamp ?? now
  const periodTo = entries[entries.length - 1]?.timestamp ?? now

  const report: Report = {
    totalCostUSD: totalCost,
    totalTokens: { input: totalInput, output: totalOutput },
    byModel,
    bySession,
    byUser,
    byFeature,
    period: { from: periodFrom, to: periodTo },
  }

  // ── Build forecast (always 24h window over all entries) ─────────────────────
  const forecastWindowMs = 24 * 60 * 60 * 1000
  const windowStart = Date.now() - forecastWindowMs
  const windowEntries = allEntries.filter(
    (e) => new Date(e.timestamp).getTime() >= windowStart,
  )

  let forecast: CostForecast
  if (windowEntries.length < 2) {
    forecast = {
      burnRatePerHour: 0,
      projectedDailyCostUSD: 0,
      projectedMonthlyCostUSD: 0,
      basedOnHours: 0,
      basedOnPeriod: null,
    }
  } else {
    const first = windowEntries[0]?.timestamp ?? ''
    const last = windowEntries[windowEntries.length - 1]?.timestamp ?? ''
    const actualMs = new Date(last).getTime() - new Date(first).getTime()
    const actualHours = actualMs / (1000 * 60 * 60)
    if (actualHours < 0.001) {
      forecast = {
        burnRatePerHour: 0,
        projectedDailyCostUSD: 0,
        projectedMonthlyCostUSD: 0,
        basedOnHours: 0,
        basedOnPeriod: { from: first, to: last },
      }
    } else {
      const windowCost = windowEntries.reduce((s, e) => s + e.costUSD, 0)
      const burnRatePerHour = windowCost / actualHours
      forecast = {
        burnRatePerHour,
        projectedDailyCostUSD: burnRatePerHour * 24,
        projectedMonthlyCostUSD: burnRatePerHour * 24 * 30,
        basedOnHours: Math.round(actualHours * 100) / 100,
        basedOnPeriod: { from: first, to: last },
      }
    }
  }

  const timeSeries = buildTimeSeries(allEntries, sinceMs)

  return { report, forecast, timeSeries, lastUpdated: now }
}
