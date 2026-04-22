import type { IStorage, UsageEntry } from '../types/index.js'

/**
 * IStorage adapter for MySQL / MariaDB using the `mysql2` driver.
 *
 * Install peer dep:  npm install mysql2
 *
 * @example
 * ```ts
 * import mysql from 'mysql2/promise'
 * import { createTracker } from '@diogonzafe/tokenwatch'
 * import { MySQLStorage } from '@diogonzafe/tokenwatch/adapters'
 *
 * const pool = mysql.createPool({ uri: process.env.MYSQL_URL })
 * const storage = new MySQLStorage(pool)
 * await storage.migrate()          // create table if it doesn't exist
 *
 * const tracker = createTracker({ storage })
 * ```
 */

// Minimal structural type so the adapter compiles without `mysql2` installed
interface QueryClient {
  execute(sql: string, values?: unknown[]): Promise<[unknown]>
}

export class MySQLStorage implements IStorage {
  constructor(private readonly client: QueryClient) {}

  /** Creates the `tokenwatch_usage` table if it does not already exist.
   *  Also adds new columns for databases created before v0.2.0. */
  async migrate(): Promise<void> {
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS tokenwatch_usage (
        id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        model            VARCHAR(255)  NOT NULL,
        input_tokens     INT           NOT NULL,
        output_tokens    INT           NOT NULL,
        reasoning_tokens INT           NOT NULL DEFAULT 0,
        cost_usd         DECIMAL(18,8) NOT NULL,
        session_id       VARCHAR(255),
        user_id          VARCHAR(255),
        feature          VARCHAR(255),
        timestamp        DATETIME(3)   NOT NULL
      )
    `)
    // Incremental migrations for databases created before v0.2.0
    await this.client.execute(`
      ALTER TABLE tokenwatch_usage
        ADD COLUMN IF NOT EXISTS reasoning_tokens INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS feature VARCHAR(255)
    `).catch(() => { /* MySQL < 8.0 may not support IF NOT EXISTS — ignore if columns already exist */ })
  }

  record(entry: UsageEntry): void {
    this.client
      .execute(
        `INSERT INTO tokenwatch_usage
         (model, input_tokens, output_tokens, reasoning_tokens, cost_usd, session_id, user_id, feature, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.model,
          entry.inputTokens,
          entry.outputTokens,
          entry.reasoningTokens ?? 0,
          entry.costUSD,
          entry.sessionId ?? null,
          entry.userId ?? null,
          entry.feature ?? null,
          entry.timestamp,
        ],
      )
      .catch((err: unknown) => {
        console.warn('[tokenwatch] MySQLStorage.record failed:', err)
      })
  }

  async getAll(): Promise<UsageEntry[]> {
    const [rows] = await this.client.execute(
      'SELECT * FROM tokenwatch_usage ORDER BY timestamp ASC',
    )
    return (rows as Array<Record<string, unknown>>).map(rowToEntry)
  }

  async clearAll(): Promise<void> {
    await this.client.execute('DELETE FROM tokenwatch_usage')
  }

  async clearSession(sessionId: string): Promise<void> {
    await this.client.execute(
      'DELETE FROM tokenwatch_usage WHERE session_id = ?',
      [sessionId],
    )
  }
}

function rowToEntry(r: Record<string, unknown>): UsageEntry {
  const reasoningTokens = (r['reasoning_tokens'] as number | null) ?? 0
  return {
    model: r['model'] as string,
    inputTokens: r['input_tokens'] as number,
    outputTokens: r['output_tokens'] as number,
    ...(reasoningTokens > 0 && { reasoningTokens }),
    costUSD: Number(r['cost_usd']),
    ...(r['session_id'] != null && { sessionId: r['session_id'] as string }),
    ...(r['user_id'] != null && { userId: r['user_id'] as string }),
    ...(r['feature'] != null && { feature: r['feature'] as string }),
    timestamp:
      r['timestamp'] instanceof Date
        ? (r['timestamp'] as Date).toISOString()
        : (r['timestamp'] as string),
  }
}
