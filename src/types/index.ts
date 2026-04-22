// ─── Price map ───────────────────────────────────────────────────────────────

export interface ModelPrice {
  /** USD per 1 million input tokens */
  input: number
  /** USD per 1 million output tokens */
  output: number
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
}

// ─── Usage / storage entries ──────────────────────────────────────────────────

export interface UsageEntry {
  model: string
  inputTokens: number
  outputTokens: number
  /** Reasoning/thinking tokens (OpenAI o1/o3/o4). Priced as output tokens.
   *  For Anthropic, this is an approximation (thinking block chars ÷ 4) and is
   *  informational only — thinking output is already included in outputTokens. */
  reasoningTokens?: number
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
  tokens: { input: number; output: number; reasoning: number }
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

export interface Report {
  totalCostUSD: number
  totalTokens: { input: number; output: number }
  byModel: Record<string, ModelStats>
  bySession: Record<string, SessionStats>
  byUser: Record<string, UserStats>
  byFeature: Record<string, FeatureStats>
  period: { from: string; to: string }
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
  getReport(): Promise<Report>
  reset(): Promise<void>
  resetSession(sessionId: string): Promise<void>
  exportJSON(): Promise<string>
  exportCSV(): Promise<string>
  /** Returns price and context window info for a model, or null if unknown */
  getModelInfo(model: string): ModelPrice | null
}

// ─── Wrapper meta fields ──────────────────────────────────────────────────────

export interface TrackingMeta {
  __sessionId?: string
  __userId?: string
  /** Tag this call with a product feature name — appears in report.byFeature */
  __feature?: string
}
