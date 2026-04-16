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

const DB_DIR = join(homedir(), '.llm-cost-tracker')
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
        '[llm-cost-tracker] SQLite storage requires better-sqlite3. ' +
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
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        model         TEXT    NOT NULL,
        input_tokens  INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        cost_usd      REAL    NOT NULL,
        session_id    TEXT,
        user_id       TEXT,
        timestamp     TEXT    NOT NULL
      )
    `)
  }

  record(entry: UsageEntry): void {
    this.db
      .prepare(
        `INSERT INTO usage
         (model, input_tokens, output_tokens, cost_usd, session_id, user_id, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.model,
        entry.inputTokens,
        entry.outputTokens,
        entry.costUSD,
        entry.sessionId ?? null,
        entry.userId ?? null,
        entry.timestamp,
      )
  }

  getAll(): UsageEntry[] {
    const rows = this.db.prepare('SELECT * FROM usage').all() as Array<{
      model: string
      input_tokens: number
      output_tokens: number
      cost_usd: number
      session_id: string | null
      user_id: string | null
      timestamp: string
    }>

    return rows.map((r) => ({
      model: r.model,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      costUSD: r.cost_usd,
      ...(r.session_id != null && { sessionId: r.session_id }),
      ...(r.user_id != null && { userId: r.user_id }),
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
