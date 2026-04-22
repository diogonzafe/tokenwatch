import type {
  Tracker,
  TrackerConfig,
  LazyTracker,
  Report,
  CostForecast,
  ModelPrice,
  ReportOptions,
  ForecastOptions,
} from '../types/index.js'
import { createTracker } from './tracker.js'

const CSV_HEADER =
  'timestamp,model,inputTokens,outputTokens,reasoningTokens,cachedTokens,cacheCreationTokens,costUSD,sessionId,userId,feature'

function emptyReport(): Report {
  const now = new Date().toISOString()
  return {
    totalCostUSD: 0,
    totalTokens: { input: 0, output: 0 },
    byModel: {},
    bySession: {},
    byUser: {},
    byFeature: {},
    period: { from: now, to: now },
  }
}

function zeroForecast(): CostForecast {
  return {
    burnRatePerHour: 0,
    projectedDailyCostUSD: 0,
    projectedMonthlyCostUSD: 0,
    basedOnHours: 0,
    basedOnPeriod: null,
  }
}

/**
 * Creates a lazy tracker that acts as a silent no-op until `init()` is called.
 *
 * Ideal for module-level singletons where the tracker is imported before `createTracker()`
 * can be called (e.g. Jest test environments, top-level module imports).
 *
 * @example
 * // tracker.ts — safe to import anywhere, even before init
 * export const tracker = createLazyTracker()
 *
 * // app.ts — initialize once at startup
 * tracker.init({ storage: 'sqlite', syncPrices: true })
 *
 * // test.ts — never call init() and track() becomes a silent no-op
 */
export function createLazyTracker(): LazyTracker {
  let delegate: Tracker | null = null

  return {
    init(config?: TrackerConfig): void {
      if (delegate !== null) {
        throw new Error(
          '[tokenwatch] LazyTracker already initialized. init() may only be called once.',
        )
      }
      try {
        delegate = createTracker(config ?? {})
      } catch (err) {
        // Leave delegate as null — tracker stays in no-op mode after a failed init
        throw err
      }
    },

    track(entry) {
      delegate?.track(entry)
    },

    async getReport(options?: ReportOptions): Promise<Report> {
      return delegate?.getReport(options) ?? emptyReport()
    },

    async getCostForecast(options?: ForecastOptions): Promise<CostForecast> {
      return delegate?.getCostForecast(options) ?? zeroForecast()
    },

    async reset(): Promise<void> {
      await delegate?.reset()
    },

    async resetSession(sessionId: string): Promise<void> {
      await delegate?.resetSession(sessionId)
    },

    async exportJSON(): Promise<string> {
      return delegate?.exportJSON() ?? '{}'
    },

    async exportCSV(): Promise<string> {
      return delegate?.exportCSV() ?? CSV_HEADER
    },

    getModelInfo(model: string): ModelPrice | null {
      return delegate?.getModelInfo(model) ?? null
    },
  }
}
