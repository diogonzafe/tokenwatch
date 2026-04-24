#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { fetchRemotePrices } from '../src/core/sync.js'
import { SqliteStorage } from '../src/core/storage.js'
import { createTracker } from '../src/core/tracker.js'
import { startDashboardServer } from '../src/dashboard/server.js'
import type { IStorage, PricesFile } from '../src/types/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_DB_PATH = join(homedir(), '.tokenwatch', 'usage.db')

// ─── Arg helpers ──────────────────────────────────────────────────────────────

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  return idx !== -1 ? (args[idx + 1] ?? undefined) : undefined
}

// ─── Storage factory ──────────────────────────────────────────────────────────

// Local interface stubs — avoids compile-time deps on optional peer packages.
// Same pattern used in src/exporters/otel.ts for @opentelemetry/api.
interface PgPoolLike { end(): Promise<void> }
interface MysqlPoolLike { end(): Promise<void> }
interface MongoClientLike { connect(): Promise<void>; close(): Promise<void>; db(name?: string): unknown }

interface StorageHandle {
  storage: IStorage
  close: () => Promise<void>
}

async function openStorage(dbUrl: string | undefined): Promise<StorageHandle> {
  // ── Default: SQLite ──────────────────────────────────────────────────────
  if (!dbUrl) {
    if (!existsSync(DEFAULT_DB_PATH)) {
      console.error(`No SQLite database found at ${DEFAULT_DB_PATH}`)
      console.error("Start your app with storage: 'sqlite' to begin recording usage.")
      console.error('Or pass --db <url> to connect to Postgres, MySQL, or MongoDB.')
      process.exit(1)
    }
    let storage: SqliteStorage
    try {
      storage = new SqliteStorage(DEFAULT_DB_PATH)
    } catch {
      console.error('Failed to open SQLite database. Is better-sqlite3 installed?')
      console.error('Run: npm install better-sqlite3')
      process.exit(1)
    }
    return { storage, close: async () => {} }
  }

  // ── Postgres ─────────────────────────────────────────────────────────────
  if (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://')) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pgMod: any
    try {
      pgMod = (await import('pg' as string)).default
    } catch {
      console.error('[tokenwatch] Postgres requires the pg package.')
      console.error('Run: npm install pg')
      process.exit(1)
    }
    const { PostgresStorage } = await import('../src/adapters/postgres.js')
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const pool = new pgMod.Pool({ connectionString: dbUrl }) as PgPoolLike
    const storage = new PostgresStorage(pool as never)
    return { storage, close: () => pool.end() }
  }

  // ── MySQL ─────────────────────────────────────────────────────────────────
  if (dbUrl.startsWith('mysql://')) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mysqlMod: any
    try {
      mysqlMod = await import('mysql2/promise' as string)
    } catch {
      console.error('[tokenwatch] MySQL requires the mysql2 package.')
      console.error('Run: npm install mysql2')
      process.exit(1)
    }
    const { MySQLStorage } = await import('../src/adapters/mysql.js')
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const pool = mysqlMod.createPool(dbUrl) as MysqlPoolLike
    const storage = new MySQLStorage(pool as never)
    return { storage, close: () => pool.end() }
  }

  // ── MongoDB ───────────────────────────────────────────────────────────────
  if (dbUrl.startsWith('mongodb://') || dbUrl.startsWith('mongodb+srv://')) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mongoMod: any
    try {
      mongoMod = await import('mongodb' as string)
    } catch {
      console.error('[tokenwatch] MongoDB requires the mongodb package.')
      console.error('Run: npm install mongodb')
      process.exit(1)
    }
    const { MongoStorage } = await import('../src/adapters/mongodb.js')
    const urlObj = new URL(dbUrl)
    const dbName = urlObj.pathname.replace(/^\//, '') || 'tokenwatch'
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const client = new mongoMod.MongoClient(dbUrl) as MongoClientLike
    await client.connect()
    const db = client.db(dbName)
    const storage = new MongoStorage(db as never)
    return { storage, close: () => client.close() }
  }

  console.error(`[tokenwatch] Unsupported database URL: "${dbUrl}"`)
  console.error('Supported protocols: postgres://, mysql://, mongodb://, mongodb+srv://')
  process.exit(1)
}

// ─── Commands ─────────────────────────────────────────────────────────────────

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

async function cmdReport(args: string[]): Promise<void> {
  const dbUrl = getFlag(args, '--db')
  const { storage, close } = await openStorage(dbUrl)

  const tracker = createTracker({ storage, syncPrices: false })
  const report = await tracker.getReport()
  await close()

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

async function cmdDashboard(args: string[]): Promise<void> {
  const portFlag = getFlag(args, '--port')
  const port = portFlag !== undefined ? parseInt(portFlag, 10) : 4242
  const dbUrl = getFlag(args, '--db')

  const { storage, close } = await openStorage(dbUrl)

  // Graceful shutdown — close DB connection when the process exits
  const shutdown = (): void => { void close().then(() => process.exit(0)) }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  startDashboardServer(storage, port)
}

function cmdHelp(): void {
  console.log(`
tokenwatch — CLI

Commands:
  sync                        Fetch and cache latest model prices from remote
  prices                      List all bundled models and their current prices
  report [--db <url>]         Show usage report (default: SQLite at ~/.tokenwatch/usage.db)
  dashboard [--port N]        Open local web dashboard (default port: 4242)
            [--db <url>]      Connect to a database instead of the default SQLite

Database URL formats:
  (none)                      ~/.tokenwatch/usage.db  (SQLite, default)
  postgres://user:pass@host:5432/dbname
  mysql://user:pass@host:3306/dbname
  mongodb://user:pass@host:27017/dbname

Examples:
  tokenwatch dashboard
  tokenwatch dashboard --port 8080
  tokenwatch dashboard --db postgres://user:pass@localhost:5432/myapp
  tokenwatch report --db mysql://root:pass@localhost:3306/myapp
`.trim())
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const [, , cmd, ...args] = process.argv

  switch (cmd) {
    case 'sync':
      await cmdSync()
      break
    case 'prices':
      cmdPrices()
      break
    case 'report':
      await cmdReport(args)
      break
    case 'dashboard':
      await cmdDashboard(args)
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
