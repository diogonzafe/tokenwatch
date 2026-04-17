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

  /** Creates the `tokenwatch_usage` table if it does not already exist. */
  async migrate(): Promise<void> {
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS tokenwatch_usage (
        id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        model         VARCHAR(255) NOT NULL,
        input_tokens  INT          NOT NULL,
        output_tokens INT          NOT NULL,
        cost_usd      DECIMAL(18,8) NOT NULL,
        session_id    VARCHAR(255),
        user_id       VARCHAR(255),
        timestamp     DATETIME(3)  NOT NULL
      )
    `)
  }

  record(entry: UsageEntry): void {
    this.client
      .execute(
        `INSERT INTO tokenwatch_usage
         (model, input_tokens, output_tokens, cost_usd, session_id, user_id, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
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
