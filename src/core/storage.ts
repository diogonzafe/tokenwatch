import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import type { IStorage, UsageEntry } from '../types/index.js'

// ─── Memory storage ───────────────────────────────────────────────────────────

export class MemoryStorage implements IStorage {
  private entries: UsageEntry[] = []

  record(entry: UsageEntry): void {
    this.entries.push(entry)
  }

  getAll(): UsageEntry[] {
    return [...this.entries]
  }

  clearAll(): void {
    this.entries = []
  }

  clearSession(sessionId: string): void {
    this.entries = this.entries.filter((e) => e.sessionId !== sessionId)
  }
}

// ─── SQLite storage ───────────────────────────────────────────────────────────

const DB_DIR = join(homedir(), '.tokenwatch')
const DB_PATH = join(DB_DIR, 'usage.db')

export class SqliteStorage implements IStorage {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any

  constructor(dbPath = DB_PATH) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let BetterSqlite3: any
    try {
      // In CJS context globalThis.require is the native require; in ESM use createRequire.
      // This makes the lazy load work in both output formats produced by tsup.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const req: NodeRequire =
        typeof (globalThis as any).require === 'function'
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (globalThis as any).require
          : createRequire(import.meta.url)
      BetterSqlite3 = req('better-sqlite3')
    } catch {
      throw new Error(
        '[tokenwatch] SQLite storage requires better-sqlite3. ' +
          'Run: npm install better-sqlite3',
      )
    }

    mkdirSync(DB_DIR, { recursive: true })
    this.db = new BetterSqlite3(dbPath)
    this.migrate()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS usage (
        id                    INTEGER PRIMARY KEY AUTOINCREMENT,
        model                 TEXT    NOT NULL,
        input_tokens          INTEGER NOT NULL,
        output_tokens         INTEGER NOT NULL,
        reasoning_tokens      INTEGER NOT NULL DEFAULT 0,
        cached_tokens         INTEGER NOT NULL DEFAULT 0,
        cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd              REAL    NOT NULL,
        session_id            TEXT,
        user_id               TEXT,
        feature               TEXT,
        timestamp             TEXT    NOT NULL
      )
    `)
    // Incremental migrations for databases created before v0.2.0 / v0.3.0
    const cols = (this.db.prepare(`PRAGMA table_info(usage)`).all() as Array<{ name: string }>)
      .map((c) => c.name)
    if (!cols.includes('reasoning_tokens')) {
      this.db.exec(`ALTER TABLE usage ADD COLUMN reasoning_tokens INTEGER NOT NULL DEFAULT 0`)
    }
    if (!cols.includes('feature')) {
      this.db.exec(`ALTER TABLE usage ADD COLUMN feature TEXT`)
    }
    if (!cols.includes('cached_tokens')) {
      this.db.exec(`ALTER TABLE usage ADD COLUMN cached_tokens INTEGER NOT NULL DEFAULT 0`)
    }
    if (!cols.includes('cache_creation_tokens')) {
      this.db.exec(`ALTER TABLE usage ADD COLUMN cache_creation_tokens INTEGER NOT NULL DEFAULT 0`)
    }
  }

  record(entry: UsageEntry): void {
    this.db
      .prepare(
        `INSERT INTO usage
         (model, input_tokens, output_tokens, reasoning_tokens, cached_tokens, cache_creation_tokens,
          cost_usd, session_id, user_id, feature, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.model,
        entry.inputTokens,
        entry.outputTokens,
        entry.reasoningTokens ?? 0,
        entry.cachedTokens ?? 0,
        entry.cacheCreationTokens ?? 0,
        entry.costUSD,
        entry.sessionId ?? null,
        entry.userId ?? null,
        entry.feature ?? null,
        entry.timestamp,
      )
  }

  getAll(): UsageEntry[] {
    const rows = this.db.prepare('SELECT * FROM usage ORDER BY timestamp ASC').all() as Array<{
      model: string
      input_tokens: number
      output_tokens: number
      reasoning_tokens: number
      cached_tokens: number
      cache_creation_tokens: number
      cost_usd: number
      session_id: string | null
      user_id: string | null
      feature: string | null
      timestamp: string
    }>

    return rows.map((r) => ({
      model: r.model,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      ...(r.reasoning_tokens > 0 && { reasoningTokens: r.reasoning_tokens }),
      ...(r.cached_tokens > 0 && { cachedTokens: r.cached_tokens }),
      ...(r.cache_creation_tokens > 0 && { cacheCreationTokens: r.cache_creation_tokens }),
      costUSD: r.cost_usd,
      ...(r.session_id != null && { sessionId: r.session_id }),
      ...(r.user_id != null && { userId: r.user_id }),
      ...(r.feature != null && { feature: r.feature }),
      timestamp: r.timestamp,
    }))
  }

  clearAll(): void {
    this.db.exec('DELETE FROM usage')
  }

  clearSession(sessionId: string): void {
    this.db.prepare('DELETE FROM usage WHERE session_id = ?').run(sessionId)
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createStorage(type: 'memory' | 'sqlite'): IStorage {
  if (type === 'sqlite') return new SqliteStorage()
  return new MemoryStorage()
}
