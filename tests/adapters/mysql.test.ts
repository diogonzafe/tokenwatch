import { describe, it, expect, vi } from 'vitest'
import { MySQLStorage } from '../../src/adapters/mysql.js'
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
    execute: vi.fn().mockResolvedValue([rows]),
  }
}

describe('MySQLStorage', () => {
  it('migrate() calls CREATE TABLE IF NOT EXISTS', async () => {
    const client = makeClient()
    const storage = new MySQLStorage(client)
    await storage.migrate()
    expect(client.execute).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS tokenwatch_usage'))
  })

  it('record() inserts a row with correct values', () => {
    const client = makeClient()
    const storage = new MySQLStorage(client)
    const entry = makeEntry({ sessionId: 'sess-1', userId: 'user-1' })
    storage.record(entry)
    expect(client.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tokenwatch_usage'),
      [entry.model, entry.inputTokens, entry.outputTokens, entry.costUSD, 'sess-1', 'user-1', entry.timestamp],
    )
  })

  it('record() uses null for missing sessionId and userId', () => {
    const client = makeClient()
    const storage = new MySQLStorage(client)
    storage.record(makeEntry())
    const args = client.execute.mock.calls[0]?.[1] as unknown[]
    expect(args[4]).toBeNull()
    expect(args[5]).toBeNull()
  })

  it('getAll() maps rows to UsageEntry[]', async () => {
    const rows = [
      { model: 'gpt-4o', input_tokens: 100, output_tokens: 50, cost_usd: '0.00075', session_id: null, user_id: 'user-1', timestamp: '2026-04-16T10:00:00.000Z' },
    ]
    const client = makeClient(rows)
    const storage = new MySQLStorage(client)
    const entries = await storage.getAll()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      model: 'gpt-4o',
      inputTokens: 100,
      outputTokens: 50,
      costUSD: 0.00075,
      userId: 'user-1',
    })
    expect(entries[0]).not.toHaveProperty('sessionId')
  })

  it('clearAll() deletes all rows', async () => {
    const client = makeClient()
    const storage = new MySQLStorage(client)
    await storage.clearAll()
    expect(client.execute).toHaveBeenCalledWith('DELETE FROM tokenwatch_usage')
  })

  it('clearSession() deletes rows for the given session', async () => {
    const client = makeClient()
    const storage = new MySQLStorage(client)
    await storage.clearSession('sess-abc')
    expect(client.execute).toHaveBeenCalledWith(
      'DELETE FROM tokenwatch_usage WHERE session_id = ?',
      ['sess-abc'],
    )
  })

  it('record() swallows errors and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const client = { execute: vi.fn().mockRejectedValue(new Error('conn error')) }
    const storage = new MySQLStorage(client)
    storage.record(makeEntry())
    await new Promise((r) => setTimeout(r, 0))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('MySQLStorage.record failed'), expect.any(Error))
    vi.restoreAllMocks()
  })
})
