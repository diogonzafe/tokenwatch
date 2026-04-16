#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchRemotePrices } from '../src/core/sync.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const COMMANDS = ['sync', 'prices', 'report', 'help']

function loadBundledPrices(): Record<string, { input: number; output: number }> {
  const pricesPath = join(__dirname, '..', 'prices.json')
  const raw = readFileSync(pricesPath, 'utf8')
  const data = JSON.parse(raw) as {
    updated_at: string
    models: Record<string, { input: number; output: number }>
  }
  return data.models
}

async function cmdSync(): Promise<void> {
  console.log('Fetching latest prices from remote...')
  const result = await fetchRemotePrices()
  if (result) {
    console.log(`✓ Prices updated. ${Object.keys(result).length} models cached.`)
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

function cmdHelp(): void {
  console.log(`
llm-cost-tracker — CLI

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
      console.log('report command requires SQLite storage to be configured in your app.')
      break
    case 'help':
    case undefined:
      cmdHelp()
      break
    default:
      console.error(`Unknown command: ${cmd}\nRun "llm-cost-tracker help" for usage.`)
      process.exit(1)
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
