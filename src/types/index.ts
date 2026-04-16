// ─── Price map ───────────────────────────────────────────────────────────────

export interface ModelPrice {
  /** USD per 1 million input tokens */
  input: number
  /** USD per 1 million output tokens */
  output: number
}

export type PriceMap = Record<string, ModelPrice>

export interface PricesFile {
  updated_at: string
  source: string
  models: PriceMap
}

// ─── Tracker config ───────────────────────────────────────────────────────────

export interface TrackerConfig {
  /** 'memory' (default) or 'sqlite' */
  storage?: 'memory' | 'sqlite'
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
  record(entry: UsageEntry): void
  getAll(): UsageEntry[]
  clearAll(): void
  clearSession(sessionId: string): void
}

// ─── Public Tracker interface ─────────────────────────────────────────────────

export interface Tracker {
  /** Accumulate a usage entry (called by providers) */
  track(entry: Omit<UsageEntry, 'costUSD' | 'timestamp'>): void
  getReport(): Report
  reset(): void
  resetSession(sessionId: string): void
  exportJSON(): string
  exportCSV(): string
}

// ─── Wrapper meta fields ──────────────────────────────────────────────────────

export interface TrackingMeta {
  __sessionId?: string
  __userId?: string
}
