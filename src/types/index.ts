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
  costUSD: number
  sessionId?: string
  userId?: string
  timestamp: string
}

// ─── Report shape ─────────────────────────────────────────────────────────────

export interface ModelStats {
  costUSD: number
  calls: number
  tokens: { input: number; output: number }
}

export interface SessionStats {
  costUSD: number
  calls: number
}

export interface UserStats {
  costUSD: number
  calls: number
}

export interface Report {
  totalCostUSD: number
  totalTokens: { input: number; output: number }
  byModel: Record<string, ModelStats>
  bySession: Record<string, SessionStats>
  byUser: Record<string, UserStats>
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
}
