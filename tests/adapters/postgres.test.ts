import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PostgresStorage } from '../../src/adapters/postgres.js'
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

function makeClient(rows: unknown[] = []) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  }
}

describe('PostgresStorage', () => {
  it('migrate() calls CREATE TABLE IF NOT EXISTS', async () => {
    const client = makeClient()
    const storage = new PostgresStorage(client)
    await storage.migrate()
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS tokenwatch_usage'))
  })

  it('record() inserts a row with correct values', () => {
    const client = makeClient()
    const storage = new PostgresStorage(client)
    const entry = makeEntry({ sessionId: 'sess-1', userId: 'user-1', reasoningTokens: 200, feature: 'chat' })
    storage.record(entry)
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tokenwatch_usage'),
      [entry.model, entry.inputTokens, entry.outputTokens, 200, 0, 0, entry.costUSD, 'sess-1', 'user-1', 'chat', entry.timestamp],
    )
  })

  it('record() uses 0/null for missing reasoningTokens, cachedTokens, sessionId, userId, feature', () => {
    const client = makeClient()
    const storage = new PostgresStorage(client)
    storage.record(makeEntry())
    const args = client.query.mock.calls[0]?.[1] as unknown[]
    expect(args[3]).toBe(0)     // reasoning_tokens default
    expect(args[4]).toBe(0)     // cached_tokens default
    expect(args[5]).toBe(0)     // cache_creation_tokens default
    expect(args[7]).toBeNull()  // session_id
    expect(args[8]).toBeNull()  // user_id
    expect(args[9]).toBeNull()  // feature
  })

  it('getAll() maps rows to UsageEntry[] including new fields', async () => {
    const rows = [
      { model: 'gpt-4o', input_tokens: 100, output_tokens: 50, reasoning_tokens: 30, cached_tokens: 0, cache_creation_tokens: 0, cost_usd: '0.00075', session_id: 'sess-1', user_id: null, feature: 'rag', timestamp: '2026-04-16T10:00:00.000Z' },
    ]
    const client = makeClient(rows)
    const storage = new PostgresStorage(client)
    const entries = await storage.getAll()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      model: 'gpt-4o',
      inputTokens: 100,
      outputTokens: 50,
      reasoningTokens: 30,
      costUSD: 0.00075,
      sessionId: 'sess-1',
      feature: 'rag',
      timestamp: '2026-04-16T10:00:00.000Z',
    })
    expect(entries[0]).not.toHaveProperty('userId')
  })

  it('getAll() converts Date timestamp to ISO string', async () => {
    const date = new Date('2026-04-16T10:00:00.000Z')
    const rows = [
      { model: 'gpt-4o', input_tokens: 10, output_tokens: 5, reasoning_tokens: 0, cached_tokens: 0, cache_creation_tokens: 0, cost_usd: '0.0001', session_id: null, user_id: null, feature: null, timestamp: date },
    ]
    const client = makeClient(rows)
    const storage = new PostgresStorage(client)
    const entries = await storage.getAll()
    expect(entries[0]?.timestamp).toBe(date.toISOString())
  })

  it('clearAll() deletes all rows', async () => {
    const client = makeClient()
    const storage = new PostgresStorage(client)
    await storage.clearAll()
    expect(client.query).toHaveBeenCalledWith('DELETE FROM tokenwatch_usage')
  })

  it('clearSession() deletes rows for the given session', async () => {
    const client = makeClient()
    const storage = new PostgresStorage(client)
    await storage.clearSession('sess-abc')
    expect(client.query).toHaveBeenCalledWith(
      'DELETE FROM tokenwatch_usage WHERE session_id = $1',
      ['sess-abc'],
    )
  })

  it('record() swallows errors and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const client = { query: vi.fn().mockRejectedValue(new Error('conn error')) }
    const storage = new PostgresStorage(client)
    storage.record(makeEntry())
    // Allow microtask to flush
    await new Promise((r) => setTimeout(r, 0))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('PostgresStorage.record failed'), expect.any(Error))
    vi.restoreAllMocks()
  })
})
