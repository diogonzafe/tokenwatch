import { describe, it, expect, vi } from 'vitest'
import { MongoStorage } from '../../src/adapters/mongodb.js'
import type { UsageEntry } from '../../src/types/index.js'

function makeEntry(overrides: Partial<UsageEntry> = {}): UsageEntry {
  return {
    model: 'gpt-4o',
    inputTokens: 100,
    outputTokens: 50,
    costUSD: 0.00075,
    timestamp: '2026-04-16T10:00:00.000Z',
    ...overrides,
  }
}

function makeDb(docs: unknown[] = []) {
  const cursor = {
    sort: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue(docs),
  }
  const collection = {
    insertOne: vi.fn().mockResolvedValue({ insertedId: 'abc' }),
    find: vi.fn().mockReturnValue(cursor),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: docs.length }),
    createIndex: vi.fn().mockResolvedValue('ok'),
  }
  return { collection: vi.fn().mockReturnValue(collection), _collection: collection, _cursor: cursor }
}

describe('MongoStorage', () => {
  it('constructor selects tokenwatch_usage collection', () => {
    const db = makeDb()
    new MongoStorage(db)
    expect(db.collection).toHaveBeenCalledWith('tokenwatch_usage')
  })

  it('createIndexes() creates indexes on key fields', async () => {
    const db = makeDb()
    const storage = new MongoStorage(db)
    await storage.createIndexes()
    expect(db._collection.createIndex).toHaveBeenCalledTimes(4)
    expect(db._collection.createIndex).toHaveBeenCalledWith({ timestamp: 1 })
    expect(db._collection.createIndex).toHaveBeenCalledWith({ sessionId: 1 })
    expect(db._collection.createIndex).toHaveBeenCalledWith({ userId: 1 })
    expect(db._collection.createIndex).toHaveBeenCalledWith({ model: 1 })
  })

  it('record() inserts a document with correct fields', () => {
    const db = makeDb()
    const storage = new MongoStorage(db)
    const entry = makeEntry({ sessionId: 'sess-1', userId: 'user-1' })
    storage.record(entry)
    expect(db._collection.insertOne).toHaveBeenCalledWith({
      model: 'gpt-4o',
      inputTokens: 100,
      outputTokens: 50,
      costUSD: 0.00075,
      sessionId: 'sess-1',
      userId: 'user-1',
      timestamp: '2026-04-16T10:00:00.000Z',
    })
  })

  it('record() uses null for missing sessionId and userId', () => {
    const db = makeDb()
    const storage = new MongoStorage(db)
    storage.record(makeEntry())
    const doc = db._collection.insertOne.mock.calls[0]?.[0] as Record<string, unknown>
    expect(doc['sessionId']).toBeNull()
    expect(doc['userId']).toBeNull()
  })

  it('getAll() maps documents to UsageEntry[]', async () => {
    const docs = [
      { model: 'gpt-4o', inputTokens: 100, outputTokens: 50, costUSD: 0.00075, sessionId: 'sess-1', userId: null, timestamp: '2026-04-16T10:00:00.000Z' },
    ]
    const db = makeDb(docs)
    const storage = new MongoStorage(db)
    const entries = await storage.getAll()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      model: 'gpt-4o',
      inputTokens: 100,
      outputTokens: 50,
      costUSD: 0.00075,
      sessionId: 'sess-1',
    })
    expect(entries[0]).not.toHaveProperty('userId')
  })

  it('getAll() sorts results by timestamp ascending', async () => {
    const db = makeDb([])
    const storage = new MongoStorage(db)
    await storage.getAll()
    expect(db._cursor.sort).toHaveBeenCalledWith({ timestamp: 1 })
  })

  it('clearAll() calls deleteMany with empty filter', async () => {
    const db = makeDb()
    const storage = new MongoStorage(db)
    await storage.clearAll()
    expect(db._collection.deleteMany).toHaveBeenCalledWith({})
  })

  it('clearSession() calls deleteMany with sessionId filter', async () => {
    const db = makeDb()
    const storage = new MongoStorage(db)
    await storage.clearSession('sess-abc')
    expect(db._collection.deleteMany).toHaveBeenCalledWith({ sessionId: 'sess-abc' })
  })

  it('record() swallows errors and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const db = makeDb()
    db._collection.insertOne.mockRejectedValue(new Error('write error'))
    const storage = new MongoStorage(db)
    storage.record(makeEntry())
    await new Promise((r) => setTimeout(r, 0))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('MongoStorage.record failed'), expect.any(Error))
    vi.restoreAllMocks()
  })
})
