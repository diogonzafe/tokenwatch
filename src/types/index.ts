// ─── Price map ───────────────────────────────────────────────────────────────

export interface ModelPrice {
  /** USD per 1 million input tokens */
  input: number
  /** USD per 1 million output tokens */
  output: number
  /** USD per 1 million cached-read input tokens (e.g. OpenAI: 50% of input, Anthropic: 10% of input) */
  cachedInput?: number
  /** USD per 1 million cache-creation input tokens (Anthropic only, typically 125% of input) */
  cacheCreationInput?: number
  /** Maximum context window (input tokens) for this model */
  maxInputTokens?: number
}

export type PriceMap = Record<string, ModelPrice>

export interface PricesFile {
  updated_at: string
  source: string
  models: PriceMap
}

// ─── Tracker config ───────────────────────────────────────────────────────────

export interface BudgetConfig {
  /** USD threshold — fires webhookUrl when per-entity cost exceeds this */
  threshold: number
  /** Discord / Slack / generic webhook URL */
  webhookUrl: string
  /** 'once' (default) — fire once per entity lifetime; 'always' — fire on every call that exceeds */
  mode?: 'once' | 'always'
}

export interface AnomalyDetectionConfig {
  /** Alert when a call's cost exceeds this multiple of the rolling per-entity average (e.g. 3 = 3×) */
  multiplierThreshold: number
  /** Discord / Slack / generic webhook URL */
  webhookUrl: string
  /** Hours of history to use as the baseline window (default: 24) */
  windowHours?: number
  /** 'once' (default) — fire once per entity; 'always' — fire on every anomalous call */
  mode?: 'once' | 'always'
}

export interface IExporter {
  /** Called after every successful track() — fire-and-forget, errors are swallowed */
  export(entry: UsageEntry): void | Promise<void>
}

export interface TrackerConfig {
  /** 'memory' (default), 'sqlite', or a custom IStorage instance (e.g. PostgresStorage, MySQLStorage, MongoStorage) */
  storage?: 'memory' | 'sqlite' | IStorage
  /** USD threshold — fires webhookUrl when totalCostUSD exceeds this */
  alertThreshold?: number
  /** Discord / Slack / generic webhook URL */
  webhookUrl?: string
  /** Fetch fresh prices from remote GitHub source (default: true) */
  syncPrices?: boolean
  /** Per-model price overrides — highest priority */
  customPrices?: PriceMap
  /** Warn if bundled/remote prices are older than N hours (default: 72). Set to 0 to disable. */
  warnIfStaleAfterHours?: number
  /** Per-user and per-session budget alerts */
  budgets?: {
    perUser?: BudgetConfig
    perSession?: BudgetConfig
  }
  /** Log a hint after each call suggesting a cheaper model in the same family when savings > 50% */
  suggestions?: boolean
  /** Alert via webhook when a call's cost is Nx above the rolling average for that user or model */
  anomalyDetection?: AnomalyDetectionConfig
  /** Custom exporter called after every tracked call (e.g. OTelExporter) */
  exporter?: IExporter
}

// ─── Usage / storage entries ──────────────────────────────────────────────────

export interface UsageEntry {
  model: string
  /** Regular (non-cached) input tokens */
  inputTokens: number
  outputTokens: number
  /** Reasoning/thinking tokens (OpenAI o1/o3/o4). Priced as output tokens.
   *  For Anthropic, this is an approximation (thinking block chars ÷ 4) and is
   *  informational only — thinking output is already included in outputTokens. */
  reasoningTokens?: number
  /** Cache-read input tokens (OpenAI: subset of prompt_tokens at 50% price; Anthropic: cache_read_input_tokens at 10% price) */
  cachedTokens?: number
  /** Cache-creation input tokens (Anthropic only: cache_creation_input_tokens at 125% price) */
  cacheCreationTokens?: number
  costUSD: number
  sessionId?: string
  userId?: string
  /** Product feature that triggered this call (set via __feature in provider params) */
  feature?: string
  timestamp: string
}

// ─── Report shape ─────────────────────────────────────────────────────────────

export interface ModelStats {
  costUSD: number
  calls: number
  tokens: { input: number; output: number; reasoning: number; cached: number }
}

export interface SessionStats {
  costUSD: number
  calls: number
}

export interface UserStats {
  costUSD: number
  calls: number
}

export interface FeatureStats {
  costUSD: number
  calls: number
}

export interface ReportOptions {
  /** ISO string or Date — only include entries at or after this time */
  since?: string | Date
  /** ISO string or Date — only include entries at or before this time */
  until?: string | Date
  /** Shorthand window: '1h', '6h', '24h', '7d', '30d' — sets `since` relative to now */
  last?: string
}

export interface Report {
  totalCostUSD: number
  totalTokens: { input: number; output: number }
  byModel: Record<string, ModelStats>
  bySession: Record<string, SessionStats>
  byUser: Record<string, UserStats>
  byFeature: Record<string, FeatureStats>
  period: { from: string; to: string }
  /** ISO date of the prices data in use (bundled or remote) */
  pricesUpdatedAt?: string
}

// ─── Cost forecast ────────────────────────────────────────────────────────────

export interface ForecastOptions {
  /** How many recent hours to use for burn-rate calculation (default: 24) */
  windowHours?: number
}

export interface CostForecast {
  burnRatePerHour: number
  projectedDailyCostUSD: number
  projectedMonthlyCostUSD: number
  /** Number of hours of data the forecast is based on (may be less than windowHours if tracker is new) */
  basedOnHours: number
  basedOnPeriod: { from: string; to: string } | null
}

// ─── Storage interface ────────────────────────────────────────────────────────

export interface IStorage {
  /** Fire-and-forget — implementations may write async and swallow errors internally */
  record(entry: UsageEntry): void | Promise<void>
  getAll(): UsageEntry[] | Promise<UsageEntry[]>
  clearAll(): void | Promise<void>
  clearSession(sessionId: string): void | Promise<void>
}

// ─── Public Tracker interface ─────────────────────────────────────────────────

export interface Tracker {
  /** Accumulate a usage entry (called by providers) */
  track(entry: Omit<UsageEntry, 'costUSD' | 'timestamp'>): void
  getReport(options?: ReportOptions): Promise<Report>
  getCostForecast(options?: ForecastOptions): Promise<CostForecast>
  reset(): Promise<void>
  resetSession(sessionId: string): Promise<void>
  exportJSON(): Promise<string>
  exportCSV(): Promise<string>
  /** Returns price and context window info for a model, or null if unknown */
  getModelInfo(model: string): ModelPrice | null
}

export interface LazyTracker extends Tracker {
  /**
   * Initialize the tracker with the given config. Must be called before any cost is tracked.
   * Calls before init() are silent no-ops. May only be called once — subsequent calls throw.
   */
  init(config?: TrackerConfig): void
}

// ─── Wrapper meta fields ──────────────────────────────────────────────────────

export interface TrackingMeta {
  __sessionId?: string
  __userId?: string
  /** Tag this call with a product feature name — appears in report.byFeature */
  __feature?: string
}
