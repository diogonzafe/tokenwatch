import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryStorage } from '../../src/core/storage.js'
import type { UsageEntry } from '../../src/types/index.js'

function makeEntry(overrides: Partial<UsageEntry> = {}): UsageEntry {
  return {
    model: 'gpt-4o',
    inputTokens: 100,
    outputTokens: 50,
    costUSD: 0.00075,
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

describe('MemoryStorage', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
  })

  it('starts empty', () => {
    expect(storage.getAll()).toHaveLength(0)
  })

  it('records and retrieves entries', () => {
    const entry = makeEntry()
    storage.record(entry)
    expect(storage.getAll()).toHaveLength(1)
    expect(storage.getAll()[0]).toEqual(entry)
  })

  it('getAll returns a copy — mutations do not affect internal state', () => {
    storage.record(makeEntry())
    const all = storage.getAll()
    all.push(makeEntry({ model: 'gpt-5' }))
    expect(storage.getAll()).toHaveLength(1)
  })

  it('clearAll removes all entries', () => {
    storage.record(makeEntry())
    storage.record(makeEntry())
    storage.clearAll()
    expect(storage.getAll()).toHaveLength(0)
  })

  it('clearSession removes only matching session', () => {
    storage.record(makeEntry({ sessionId: 'session-a' }))
    storage.record(makeEntry({ sessionId: 'session-b' }))
    storage.record(makeEntry({ sessionId: 'session-a' }))
    storage.clearSession('session-a')
    const remaining = storage.getAll()
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.sessionId).toBe('session-b')
  })

  it('clearSession does nothing when no matching session', () => {
    storage.record(makeEntry({ sessionId: 'session-a' }))
    storage.clearSession('nonexistent')
    expect(storage.getAll()).toHaveLength(1)
  })
})
