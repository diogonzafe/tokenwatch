import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { PricesFile, PriceMap } from '../types/index.js'

const CACHE_DIR = join(homedir(), '.tokenwatch')
const CACHE_FILE = join(CACHE_DIR, 'prices.json')
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const REMOTE_URL =
  'https://raw.githubusercontent.com/diogonzafe/tokenwatch/main/prices.json'

export interface PricesResult {
  models: PriceMap
  updated_at: string
}

export async function fetchRemotePrices(url = REMOTE_URL): Promise<PricesResult | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) })
    if (!res.ok) return null
    const data = (await res.json()) as PricesFile
    if (!data?.models) return null
    await persistCache(data)
    return { models: data.models, updated_at: data.updated_at ?? '' }
  } catch {
    return null
  }
}

export async function loadCachedPrices(): Promise<PricesResult | null> {
  if (!existsSync(CACHE_FILE)) return null
  try {
    const raw = await readFile(CACHE_FILE, 'utf8')
    const data = JSON.parse(raw) as PricesFile & { _cachedAt?: number }
    const age = Date.now() - (data._cachedAt ?? 0)
    if (age > CACHE_TTL_MS) return null
    if (!data.models) return null
    return { models: data.models, updated_at: data.updated_at ?? '' }
  } catch {
    return null
  }
}

async function persistCache(data: PricesFile): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true })
    const payload = { ...data, _cachedAt: Date.now() }
    await writeFile(CACHE_FILE, JSON.stringify(payload, null, 2), 'utf8')
  } catch {
    // best-effort — never throw
  }
}

/**
 * Returns the best available remote price result:
 * 1. Valid local cache (< 24h)
 * 2. Fresh remote fetch (also updates cache)
 * 3. null if both fail
 */
export async function getRemotePrices(): Promise<PricesResult | null> {
  const cached = await loadCachedPrices()
  if (cached) return cached
  return fetchRemotePrices()
}
