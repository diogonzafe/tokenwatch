import type { IStorage, UsageEntry } from '../types/index.js'

/**
 * IStorage adapter for PostgreSQL using the `pg` driver.
 *
 * Install peer dep:  npm install pg
 * Types (optional):  npm install -D @types/pg
 *
 * @example
 * ```ts
 * import { Pool } from 'pg'
 * import { createTracker } from '@diogonzafe/tokenwatch'
 * import { PostgresStorage } from '@diogonzafe/tokenwatch/adapters'
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL })
 * const storage = new PostgresStorage(pool)
 * await storage.migrate()          // create table if it doesn't exist
 *
 * const tracker = createTracker({ storage })
 * ```
 */

// Minimal structural types so the adapter compiles without `pg` installed
interface QueryClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: unknown[] }>
}

export class PostgresStorage implements IStorage {
  constructor(private readonly client: QueryClient) {}

  /** Creates the `tokenwatch_usage` table if it does not already exist. */
  async migrate(): Promise<void> {
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS tokenwatch_usage (
        id            BIGSERIAL PRIMARY KEY,
        model         TEXT      NOT NULL,
        input_tokens  INTEGER   NOT NULL,
        output_tokens INTEGER   NOT NULL,
        cost_usd      NUMERIC   NOT NULL,
        session_id    TEXT,
        user_id       TEXT,
        timestamp     TIMESTAMPTZ NOT NULL
      )
    `)
  }

  record(entry: UsageEntry): void {
    this.client
      .query(
        `INSERT INTO tokenwatch_usage
         (model, input_tokens, output_tokens, cost_usd, session_id, user_id, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          entry.model,
          entry.inputTokens,
          entry.outputTokens,
          entry.costUSD,
          entry.sessionId ?? null,
          entry.userId ?? null,
          entry.timestamp,
        ],
      )
      .catch((err: unknown) => {
        console.warn('[tokenwatch] PostgresStorage.record failed:', err)
      })
  }

  async getAll(): Promise<UsageEntry[]> {
    const result = await this.client.query(
      'SELECT * FROM tokenwatch_usage ORDER BY timestamp ASC',
    )
    return (result.rows as Array<Record<string, unknown>>).map(rowToEntry)
  }

  async clearAll(): Promise<void> {
    await this.client.query('DELETE FROM tokenwatch_usage')
  }

  async clearSession(sessionId: string): Promise<void> {
    await this.client.query(
      'DELETE FROM tokenwatch_usage WHERE session_id = $1',
      [sessionId],
    )
  }
}

function rowToEntry(r: Record<string, unknown>): UsageEntry {
  return {
    model: r['model'] as string,
    inputTokens: r['input_tokens'] as number,
    outputTokens: r['output_tokens'] as number,
    costUSD: Number(r['cost_usd']),
    ...(r['session_id'] != null && { sessionId: r['session_id'] as string }),
    ...(r['user_id'] != null && { userId: r['user_id'] as string }),
    timestamp:
      r['timestamp'] instanceof Date
        ? (r['timestamp'] as Date).toISOString()
        : (r['timestamp'] as string),
  }
}
