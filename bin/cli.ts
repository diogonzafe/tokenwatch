#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { fetchRemotePrices } from '../src/core/sync.js'
import { SqliteStorage } from '../src/core/storage.js'
import { createTracker } from '../src/core/tracker.js'
import type { PricesFile } from '../src/types/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(homedir(), '.tokenwatch', 'usage.db')

function loadBundledPrices(): PricesFile['models'] {
  const pricesPath = join(__dirname, '..', 'prices.json')
  const raw = readFileSync(pricesPath, 'utf8')
  const data = JSON.parse(raw) as PricesFile
  return data.models
}

async function cmdSync(): Promise<void> {
  console.log('Fetching latest prices from remote...')
  const result = await fetchRemotePrices()
  if (result) {
    console.log(`✓ Prices updated. ${Object.keys(result.models).length} models cached (updated_at: ${result.updated_at}).`)
  } else {
    console.error('✗ Failed to fetch remote prices. Check your internet connection.')
    process.exit(1)
  }
}

function cmdPrices(): void {
  const models = loadBundledPrices()
  const rows = Object.entries(models).map(([name, price]) => ({
    model: name,
    input: `$${price.input.toFixed(2)}/M`,
    output: `$${price.output.toFixed(2)}/M`,
  }))

  const maxName = Math.max(...rows.map((r) => r.model.length), 5)
  const header = `${'Model'.padEnd(maxName)}  ${'Input'.padStart(12)}  ${'Output'.padStart(12)}`
  const sep = '-'.repeat(header.length)

  console.log(header)
  console.log(sep)
  for (const row of rows) {
    console.log(`${row.model.padEnd(maxName)}  ${row.input.padStart(12)}  ${row.output.padStart(12)}`)
  }
}

async function cmdReport(): Promise<void> {
  if (!existsSync(DB_PATH)) {
    console.log(`No SQLite database found at ${DB_PATH}`)
    console.log('Start your app with storage: \'sqlite\' to begin recording usage.')
    return
  }

  let storage: SqliteStorage
  try {
    storage = new SqliteStorage(DB_PATH)
  } catch {
    console.error('Failed to open SQLite database. Is better-sqlite3 installed?')
    console.error('Run: npm install better-sqlite3')
    process.exit(1)
  }

  const tracker = createTracker({ storage, syncPrices: false })
  const report = await tracker.getReport()

  if (report.totalCostUSD === 0 && Object.keys(report.byModel).length === 0) {
    console.log('No usage recorded yet.')
    return
  }

  console.log('\n── tokenwatch report ──────────────────────────────')
  console.log(`  Total cost:   $${report.totalCostUSD.toFixed(6)} USD`)
  console.log(`  Total tokens: ${report.totalTokens.input.toLocaleString()} in / ${report.totalTokens.output.toLocaleString()} out`)
  console.log(`  Period:       ${report.period.from}  →  ${report.period.to}`)
  if (report.pricesUpdatedAt) {
    console.log(`  Prices as of: ${report.pricesUpdatedAt}`)
  }

  if (Object.keys(report.byModel).length > 0) {
    console.log('\n  By model:')
    for (const [model, stats] of Object.entries(report.byModel)) {
      console.log(`    ${model.padEnd(30)} $${stats.costUSD.toFixed(6)}  (${stats.calls} calls)`)
    }
  }

  if (Object.keys(report.byUser).length > 0) {
    console.log('\n  By user:')
    for (const [user, stats] of Object.entries(report.byUser)) {
      console.log(`    ${user.padEnd(30)} $${stats.costUSD.toFixed(6)}  (${stats.calls} calls)`)
    }
  }

  if (Object.keys(report.bySession).length > 0) {
    console.log('\n  By session:')
    for (const [session, stats] of Object.entries(report.bySession)) {
      console.log(`    ${session.padEnd(30)} $${stats.costUSD.toFixed(6)}  (${stats.calls} calls)`)
    }
  }

  if (Object.keys(report.byFeature).length > 0) {
    console.log('\n  By feature:')
    for (const [feature, stats] of Object.entries(report.byFeature)) {
      console.log(`    ${feature.padEnd(30)} $${stats.costUSD.toFixed(6)}  (${stats.calls} calls)`)
    }
  }

  console.log('───────────────────────────────────────────────────\n')
}

function cmdHelp(): void {
  console.log(`
tokenwatch — CLI

Commands:
  sync      Fetch and cache latest model prices from remote
  prices    List all bundled models and their current prices
  report    Show last saved usage report (requires SQLite storage)
  help      Show this help message
`.trim())
}

async function main(): Promise<void> {
  const [, , cmd, ...args] = process.argv
  void args

  switch (cmd) {
    case 'sync':
      await cmdSync()
      break
    case 'prices':
      cmdPrices()
      break
    case 'report':
      await cmdReport()
      break
    case 'help':
    case undefined:
      cmdHelp()
      break
    default:
      console.error(`Unknown command: ${cmd}\nRun "tokenwatch help" for usage.`)
      process.exit(1)
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
