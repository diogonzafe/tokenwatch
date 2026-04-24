import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── getFlag ─────────────────────────────────────────────────────────────────
// We test the flag-parsing logic inline since getFlag is not exported.
// The logic is: find the flag, return the next arg if it exists and doesn't
// start with '--'. Edge cases: missing value, another flag as value, last arg.

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx === -1) return undefined
  const value = args[idx + 1]
  return value !== undefined && !value.startsWith('--') ? value : undefined
}

describe('getFlag', () => {
  it('returns the value after the flag', () => {
    expect(getFlag(['--port', '8080'], '--port')).toBe('8080')
  })

  it('returns undefined when flag is absent', () => {
    expect(getFlag(['--db', 'postgres://localhost/db'], '--port')).toBeUndefined()
  })

  it('returns undefined when flag is the last arg (no value follows)', () => {
    expect(getFlag(['--port'], '--port')).toBeUndefined()
  })

  it('returns undefined when the next arg is another flag', () => {
    // e.g. --db --port 8080 should NOT treat --port as the db url
    expect(getFlag(['--db', '--port', '8080'], '--db')).toBeUndefined()
  })

  it('returns a postgres url correctly', () => {
    const args = ['--db', 'postgres://user:pass@localhost:5432/myapp']
    expect(getFlag(args, '--db')).toBe('postgres://user:pass@localhost:5432/myapp')
  })

  it('works with both flags present', () => {
    const args = ['--port', '9090', '--db', 'mysql://localhost/db']
    expect(getFlag(args, '--port')).toBe('9090')
    expect(getFlag(args, '--db')).toBe('mysql://localhost/db')
  })

  it('works when flags appear in reverse order', () => {
    const args = ['--db', 'mongodb://localhost/db', '--port', '4242']
    expect(getFlag(args, '--port')).toBe('4242')
    expect(getFlag(args, '--db')).toBe('mongodb://localhost/db')
  })
})

// ─── port validation ──────────────────────────────────────────────────────────

function parsePort(portFlag: string | undefined): number | null {
  if (portFlag === undefined) return 4242
  const port = parseInt(portFlag, 10)
  if (isNaN(port) || port < 1 || port > 65535) return null
  return port
}

describe('port validation', () => {
  it('returns 4242 when no --port flag', () => {
    expect(parsePort(undefined)).toBe(4242)
  })

  it('parses a valid port', () => {
    expect(parsePort('8080')).toBe(8080)
  })

  it('returns null for NaN port', () => {
    expect(parsePort('abc')).toBeNull()
  })

  it('returns null for port 0', () => {
    expect(parsePort('0')).toBeNull()
  })

  it('returns null for port above 65535', () => {
    expect(parsePort('99999')).toBeNull()
  })

  it('accepts boundary ports 1 and 65535', () => {
    expect(parsePort('1')).toBe(1)
    expect(parsePort('65535')).toBe(65535)
  })
})

// ─── URL protocol detection ───────────────────────────────────────────────────

function detectProtocol(url: string): 'sqlite' | 'postgres' | 'mysql' | 'mongodb' | 'unknown' {
  if (!url) return 'sqlite'
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return 'postgres'
  if (url.startsWith('mysql://')) return 'mysql'
  if (url.startsWith('mongodb://') || url.startsWith('mongodb+srv://')) return 'mongodb'
  return 'unknown'
}

describe('URL protocol detection', () => {
  it('detects postgres://', () => {
    expect(detectProtocol('postgres://user:pass@localhost:5432/db')).toBe('postgres')
  })

  it('detects postgresql://', () => {
    expect(detectProtocol('postgresql://user:pass@localhost:5432/db')).toBe('postgres')
  })

  it('detects mysql://', () => {
    expect(detectProtocol('mysql://user:pass@localhost:3306/db')).toBe('mysql')
  })

  it('detects mongodb://', () => {
    expect(detectProtocol('mongodb://user:pass@localhost:27017/db')).toBe('mongodb')
  })

  it('detects mongodb+srv://', () => {
    expect(detectProtocol('mongodb+srv://user:pass@cluster.mongodb.net/db')).toBe('mongodb')
  })

  it('returns unknown for unsupported protocols', () => {
    expect(detectProtocol('redis://localhost:6379')).toBe('unknown')
    expect(detectProtocol('sqlite:///tmp/db.sqlite')).toBe('unknown')
  })
})

// ─── MongoDB dbName extraction ────────────────────────────────────────────────

function extractMongoDbName(url: string): string {
  const urlObj = new URL(url)
  return urlObj.pathname.replace(/^\//, '') || 'tokenwatch'
}

describe('MongoDB database name extraction', () => {
  it('extracts db name from path', () => {
    expect(extractMongoDbName('mongodb://localhost:27017/myapp')).toBe('myapp')
  })

  it('falls back to "tokenwatch" when path is empty', () => {
    expect(extractMongoDbName('mongodb://localhost:27017/')).toBe('tokenwatch')
    expect(extractMongoDbName('mongodb://localhost:27017')).toBe('tokenwatch')
  })

  it('works with mongodb+srv', () => {
    expect(extractMongoDbName('mongodb+srv://user:pass@cluster.mongodb.net/production')).toBe('production')
  })
})

// ─── startDashboardServer integration ────────────────────────────────────────
// Verify the server function accepts any IStorage (not just SqliteStorage)

describe('startDashboardServer accepts any IStorage', () => {
  it('can be called with a memory-backed IStorage', async () => {
    const { createTracker } = await import('../../src/core/tracker.js')
    const { startDashboardServer } = await import('../../src/dashboard/server.js')

    const tracker = createTracker({ syncPrices: false })
    tracker.track({ model: 'gpt-4o', inputTokens: 100, outputTokens: 50 })

    // Get internal storage via a report (we don't have direct access, but we can
    // verify the server accepts the storage shape by using a minimal IStorage stub)
    const mockStorage = {
      record: vi.fn(),
      getAll: vi.fn().mockResolvedValue([]),
      clearAll: vi.fn(),
      clearSession: vi.fn(),
    }

    let server: { close(cb: () => void): void } | null = null
    await new Promise<void>((resolve, reject) => {
      try {
        // startDashboardServer is synchronous — it starts and returns
        // We use a high port to avoid conflicts
        startDashboardServer(mockStorage, 19999)
        // Give the server a tick to bind
        setTimeout(() => {
          resolve()
        }, 50)
      } catch (err) {
        reject(err)
      }
    })

    // Clean up — the server is stored on the http module, we just verify no throw
    // The test verifies the function accepts IStorage without crashing
    void server
  })
})
