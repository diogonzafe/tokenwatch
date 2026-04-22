import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchRemotePrices, loadCachedPrices, getRemotePrices } from '../../src/core/sync.js'

// vi.mock is hoisted above variable declarations, so mocks must be created
// with vi.hoisted() to be available inside the factory.
const { mockExistsSync, mockReadFile } = vi.hoisted(() => ({
  mockExistsSync: vi.fn().mockReturnValue(false),
  mockReadFile: vi.fn<() => Promise<string>>(),
}))

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return { ...actual, existsSync: mockExistsSync }
})

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  return { ...actual, readFile: mockReadFile }
})

const MOCK_PRICES = {
  updated_at: '2026-04-17',
  source: 'https://example.com',
  models: {
    'gpt-4o': { input: 2.5, output: 10 },
  },
}

afterEach(() => {
  vi.restoreAllMocks()
  mockExistsSync.mockReturnValue(false)
  mockReadFile.mockReset()
})

describe('fetchRemotePrices', () => {
  it('returns models when fetch succeeds', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_PRICES),
    } as unknown as Response)

    const result = await fetchRemotePrices('https://example.com/prices.json')
    expect(result).not.toBeNull()
    expect(result!.models).toMatchObject({ 'gpt-4o': { input: 2.5 } })
    expect(result!.updated_at).toBe('2026-04-17')
  })

  it('returns null when fetch response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false } as Response)
    const result = await fetchRemotePrices('https://example.com/prices.json')
    expect(result).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
    const result = await fetchRemotePrices('https://example.com/prices.json')
    expect(result).toBeNull()
  })

  it('returns null when response has no models', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ updated_at: '2026-01-01' }),
    } as unknown as Response)
    const result = await fetchRemotePrices('https://example.com/prices.json')
    expect(result).toBeNull()
  })
})

describe('loadCachedPrices', () => {
  it('returns null when cache file does not exist', async () => {
    mockExistsSync.mockReturnValue(false)
    const result = await loadCachedPrices()
    expect(result).toBeNull()
  })

  it('returns models when cache file is fresh', async () => {
    mockExistsSync.mockReturnValue(true)
    const payload = { ...MOCK_PRICES, _cachedAt: Date.now() }
    mockReadFile.mockResolvedValue(JSON.stringify(payload))

    const result = await loadCachedPrices()
    expect(result).not.toBeNull()
    expect(result!.models).toMatchObject({ 'gpt-4o': { input: 2.5 } })
    expect(result!.updated_at).toBe('2026-04-17')
  })

  it('returns null when cache file is stale (> 24h)', async () => {
    mockExistsSync.mockReturnValue(true)
    const oldCachedAt = Date.now() - 25 * 60 * 60 * 1000
    const payload = { ...MOCK_PRICES, _cachedAt: oldCachedAt }
    mockReadFile.mockResolvedValue(JSON.stringify(payload))

    const result = await loadCachedPrices()
    expect(result).toBeNull()
  })

  it('returns null when cache file is malformed JSON', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFile.mockResolvedValue('not valid json {{{')

    const result = await loadCachedPrices()
    expect(result).toBeNull()
  })
})

describe('getRemotePrices', () => {
  it('returns cached data without calling fetch when cache is a hit', async () => {
    mockExistsSync.mockReturnValue(true)
    const payload = { ...MOCK_PRICES, _cachedAt: Date.now() }
    mockReadFile.mockResolvedValue(JSON.stringify(payload))
    const mockFetch = vi.fn()
    global.fetch = mockFetch

    const result = await getRemotePrices()

    expect(result).not.toBeNull()
    expect(result!.models).toMatchObject({ 'gpt-4o': { input: 2.5 } })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('calls fetch and returns its result when cache is a miss', async () => {
    mockExistsSync.mockReturnValue(false)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_PRICES),
    } as unknown as Response)

    const result = await getRemotePrices()

    expect(global.fetch).toHaveBeenCalled()
    expect(result).not.toBeNull()
    expect(result!.models).toMatchObject({ 'gpt-4o': { input: 2.5 } })
  })

  it('returns null when cache misses and fetch fails', async () => {
    mockExistsSync.mockReturnValue(false)
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const result = await getRemotePrices()

    expect(result).toBeNull()
  })
})
