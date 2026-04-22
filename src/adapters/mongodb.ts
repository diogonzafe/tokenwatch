import type { IStorage, UsageEntry } from '../types/index.js'

/**
 * IStorage adapter for MongoDB using the official `mongodb` driver.
 *
 * Install peer dep:  npm install mongodb
 *
 * @example
 * ```ts
 * import { MongoClient } from 'mongodb'
 * import { createTracker } from '@diogonzafe/tokenwatch'
 * import { MongoStorage } from '@diogonzafe/tokenwatch/adapters'
 *
 * const client = new MongoClient(process.env.MONGO_URL!)
 * await client.connect()
 *
 * const storage = new MongoStorage(client.db('myapp'))
 * const tracker = createTracker({ storage })
 * ```
 *
 * Recommended index (run once at startup):
 * ```ts
 * await storage.createIndexes()
 * ```
 */

// Minimal structural types so the adapter compiles without `mongodb` installed
interface MongoDocument {
  _id?: unknown
  model: string
  inputTokens: number
  outputTokens: number
  reasoningTokens?: number
  cachedTokens?: number
  cacheCreationTokens?: number
  costUSD: number
  sessionId?: string | null
  userId?: string | null
  feature?: string | null
  timestamp: string
}

interface MongoCursor {
  sort(sort: Record<string, unknown>): MongoCursor
  toArray(): Promise<MongoDocument[]>
}

interface Collection {
  insertOne(doc: MongoDocument): Promise<unknown>
  find(filter: Record<string, unknown>): MongoCursor
  deleteMany(filter: Record<string, unknown>): Promise<unknown>
  createIndex(index: Record<string, unknown>): Promise<unknown>
}

interface Database {
  collection(name: string): Collection
}

const COLLECTION = 'tokenwatch_usage'

export class MongoStorage implements IStorage {
  private readonly col: Collection

  constructor(db: Database) {
    this.col = db.collection(COLLECTION)
  }

  /** Creates recommended indexes for query performance. Call once at startup. */
  async createIndexes(): Promise<void> {
    await this.col.createIndex({ timestamp: 1 })
    await this.col.createIndex({ sessionId: 1 })
    await this.col.createIndex({ userId: 1 })
    await this.col.createIndex({ model: 1 })
  }

  record(entry: UsageEntry): void {
    this.col
      .insertOne({
        model: entry.model,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        ...(entry.reasoningTokens !== undefined && { reasoningTokens: entry.reasoningTokens }),
        ...(entry.cachedTokens !== undefined && { cachedTokens: entry.cachedTokens }),
        ...(entry.cacheCreationTokens !== undefined && { cacheCreationTokens: entry.cacheCreationTokens }),
        costUSD: entry.costUSD,
        sessionId: entry.sessionId ?? null,
        userId: entry.userId ?? null,
        ...(entry.feature !== undefined && { feature: entry.feature }),
        timestamp: entry.timestamp,
      })
      .catch((err: unknown) => {
        console.warn('[tokenwatch] MongoStorage.record failed:', err)
      })
  }

  async getAll(): Promise<UsageEntry[]> {
    const docs = await this.col.find({}).sort({ timestamp: 1 }).toArray()
    return docs.map(docToEntry)
  }

  async clearAll(): Promise<void> {
    await this.col.deleteMany({})
  }

  async clearSession(sessionId: string): Promise<void> {
    await this.col.deleteMany({ sessionId })
  }
}

function docToEntry(doc: MongoDocument): UsageEntry {
  return {
    model: doc.model,
    inputTokens: doc.inputTokens,
    outputTokens: doc.outputTokens,
    ...(doc.reasoningTokens != null && doc.reasoningTokens > 0 && { reasoningTokens: doc.reasoningTokens }),
    ...(doc.cachedTokens != null && doc.cachedTokens > 0 && { cachedTokens: doc.cachedTokens }),
    ...(doc.cacheCreationTokens != null && doc.cacheCreationTokens > 0 && { cacheCreationTokens: doc.cacheCreationTokens }),
    costUSD: doc.costUSD,
    ...(doc.sessionId != null && { sessionId: doc.sessionId }),
    ...(doc.userId != null && { userId: doc.userId }),
    ...(doc.feature != null && { feature: doc.feature }),
    timestamp: doc.timestamp,
  }
}
