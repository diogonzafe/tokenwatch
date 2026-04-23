# @diogonzafe/tokenwatch

Transparent TypeScript wrapper that intercepts LLM API calls and tracks cost in real-time by session, user, model and feature — without changing anything in your existing code.

Supports **OpenAI**, **Anthropic**, **Google Gemini** and **DeepSeek**.

## Installation

```bash
npm install @diogonzafe/tokenwatch
```

Peer dependencies (install only what you use):

```bash
npm install openai                  # OpenAI / DeepSeek
npm install @anthropic-ai/sdk       # Anthropic
npm install @google/generative-ai   # Gemini
npm install better-sqlite3          # optional — only for storage: 'sqlite'

# Database adapters (optional — only if using @diogonzafe/tokenwatch/adapters)
npm install pg          # PostgreSQL
npm install mysql2      # MySQL / MariaDB
npm install mongodb     # MongoDB
```

---

## Setup

```ts
import { createTracker } from '@diogonzafe/tokenwatch'

const tracker = createTracker({
  // All fields are optional
  storage: 'memory',           // 'memory' (default) | 'sqlite' | IStorage instance
  alertThreshold: 1.00,        // USD — fires webhookUrl when total cost exceeded
  webhookUrl: 'https://...',   // Discord / Slack webhook
  syncPrices: true,            // fetch fresh prices from GitHub (default: true)
  warnIfStaleAfterHours: 72,   // warn if prices are older than N hours (0 = disable)
  customPrices: {
    'my-model': { input: 0.50, output: 1.50, maxInputTokens: 32000 }  // USD per 1M tokens
  },
  budgets: {
    perUser:    { threshold: 1.00, webhookUrl: 'https://...' },  // per-user alert
    perSession: { threshold: 0.10, webhookUrl: 'https://...' },  // per-session alert
  },
  suggestions: true,            // log hints for cheaper models in same family (>50% savings)
})
```

---

## Lazy Initialization

For module-level singletons where the tracker needs to be imported before `createTracker()` can run (e.g. shared modules, Jest test environments):

```ts
import { createLazyTracker } from '@diogonzafe/tokenwatch'

// Safe to import anywhere — all methods are no-ops until init() is called
export const tracker = createLazyTracker()

// At app startup (e.g. index.ts / server.ts):
tracker.init({ storage: 'sqlite', syncPrices: true })

// In tests — never call init(), track() silently no-ops:
tracker.track({ model: 'gpt-4o', inputTokens: 100, outputTokens: 50 }) // does nothing
```

`init()` may only be called once — a second call throws. A failed `init()` (e.g. invalid config) leaves the tracker in no-op mode. `LazyTracker` satisfies the `Tracker` interface, so it can be used anywhere a `Tracker` is expected.

---

## OpenAI

```ts
import OpenAI from 'openai'
import { wrapOpenAI } from '@diogonzafe/tokenwatch'

const openai = wrapOpenAI(new OpenAI(), tracker)

const res = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
  // Optional — removed before sending to the API
  __sessionId: 'session_abc',
  __userId: 'user_123',
  __feature: 'chat',       // tag calls by product feature → report.byFeature
})
// res is identical to the original OpenAI response — zero difference
```

Streaming is supported:

```ts
const stream = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [...],
  stream: true,
  stream_options: { include_usage: true },  // required for usage in stream
})

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? '')
}
// Cost tracked automatically from the final chunk
```

Embeddings are also tracked automatically:

```ts
const embedding = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: 'The food was delicious',
  __sessionId: 'session_abc',
  __feature: 'rag',   // optional
})
// inputTokens = usage.total_tokens, outputTokens = 0
```

> **Note:** `wrapOpenAI` covers `chat.completions` and `embeddings`. Other endpoints (e.g. fine-tuning, images) are not intercepted — use `tracker.track()` manually if needed.

---

## Anthropic

```ts
import Anthropic from '@anthropic-ai/sdk'
import { wrapAnthropic } from '@diogonzafe/tokenwatch'

const anthropic = wrapAnthropic(new Anthropic(), tracker)

const res = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello' }],
  __sessionId: 'session_abc',
  __userId: 'user_123',
  __feature: 'summarizer',
})
```

---

## Google Gemini

```ts
import { GoogleGenerativeAI } from '@google/generative-ai'
import { wrapGemini } from '@diogonzafe/tokenwatch'

const genAI = wrapGemini(new GoogleGenerativeAI(process.env.GEMINI_API_KEY!), tracker)

// __sessionId, __userId, __feature are passed to getGenerativeModel (not per-call)
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  __sessionId: 'session_abc',
  __feature: 'rag',
})
const result = await model.generateContent('Explain quantum computing')
```

---

## DeepSeek

DeepSeek uses an OpenAI-compatible API — just set `baseURL`:

```ts
import OpenAI from 'openai'
import { wrapDeepSeek } from '@diogonzafe/tokenwatch'

const deepseek = wrapDeepSeek(
  new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY!,
  }),
  tracker,
)

const res = await deepseek.chat.completions.create({
  model: 'deepseek-chat',
  messages: [{ role: 'user', content: 'Hello' }],
})
```

---

## Agent Frameworks

Frameworks like **Mastra**, **Vercel AI SDK**, **LlamaIndex**, and **LangChain** use their own internal LLM abstractions — they never expose the raw OpenAI/Anthropic client. `wrapOpenAI` and `wrapAnthropic` do not apply. Use `tracker.track()` manually via each framework's usage callback instead.

> `tracker.track()` always expects `inputTokens` and `outputTokens`. The field names exposed by each framework differ — see the mappings below.

### Mastra

`agent.generate()` and `agent.stream()` expose usage in `onStepFinish`:

```ts
import { Agent } from '@mastra/core/agent'
import { createTracker } from '@diogonzafe/tokenwatch'

const tracker = createTracker({ storage: 'sqlite' })

const agent = new Agent({ model: 'openai/gpt-4o', instructions: '...' })

const result = await agent.generate('Hello', {
  onStepFinish: ({ usage }) => {
    tracker.track({
      model: 'gpt-4o',
      inputTokens: usage.promptTokens,      // Mastra uses promptTokens
      outputTokens: usage.completionTokens, // Mastra uses completionTokens
      sessionId: 'sess-abc',
    })
  },
})
```

### Vercel AI SDK

`streamText` / `generateText` expose usage in `onFinish`. As of `ai` v5, the fields are `inputTokens` / `outputTokens`:

```ts
import { createOpenAI } from '@ai-sdk/openai'
import { streamText } from 'ai'
import { createTracker } from '@diogonzafe/tokenwatch'

const tracker = createTracker({ storage: 'sqlite' })
const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! })

await streamText({
  model: openai('gpt-4o'),
  prompt: 'Hello',
  onFinish: ({ usage }) => {
    tracker.track({
      model: 'gpt-4o',
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
    })
  },
})
```

For multi-step agents, use `totalUsage` instead of `usage` in `onFinish` to get the aggregate across all steps.

### LlamaIndex TypeScript

Use `Settings.callbackManager` to intercept `llm-end` events. The raw OpenAI response is available as `response.raw` with snake_case field names:

```ts
import { Settings } from 'llamaindex'
import { createTracker } from '@diogonzafe/tokenwatch'

const tracker = createTracker({ storage: 'sqlite' })

Settings.callbackManager.on('llm-end', (event) => {
  const raw = event.detail.response.raw as { model?: string; usage?: { prompt_tokens: number; completion_tokens: number } }
  if (raw?.usage) {
    tracker.track({
      model: raw.model ?? 'unknown',
      inputTokens: raw.usage.prompt_tokens,      // LlamaIndex exposes snake_case
      outputTokens: raw.usage.completion_tokens,
    })
  }
})
```

### LangChain.js

Use the built-in `TokenwatchCallbackHandler` from the `/langchain` sub-path:

```ts
import { ChatOpenAI } from '@langchain/openai'
import { createTracker } from '@diogonzafe/tokenwatch'
import { TokenwatchCallbackHandler } from '@diogonzafe/tokenwatch/langchain'

const tracker = createTracker({ storage: 'sqlite' })
const handler = new TokenwatchCallbackHandler(tracker, {
  defaultModel: 'gpt-4o',    // fallback when the response doesn't include the model name
  sessionId: 'sess_abc',     // optional — tag all calls from this handler
  userId: 'user_123',
  feature: 'chat',
})

const llm = new ChatOpenAI({ model: 'gpt-4o', callbacks: [handler] })
```

The handler extracts `promptTokens` / `completionTokens` from `llmOutput.tokenUsage` (non-streaming) and falls back to `estimatedTokenUsage` for streaming calls. No `@langchain/core` compile-time dependency is required in tokenwatch itself — it is an optional peer dependency.

> **Note:** This requires `@langchain/core >= 0.1.0` to be installed in your project.

---

## Reports

All report methods are async:

```ts
const report = await tracker.getReport()
// {
//   totalCostUSD: 0.087,
//   totalTokens: { input: 24000, output: 6000 },
//   byModel: {
//     'gpt-4o': { costUSD: 0.062, calls: 5, tokens: { input: 20000, output: 5000, reasoning: 0, cached: 4000 } },
//     'o3':     { costUSD: 0.041, calls: 1, tokens: { input: 1000,  output: 200,  reasoning: 800, cached: 0 } },
//   },
//   bySession: { 'session_abc': { costUSD: 0.045, calls: 4 } },
//   byUser:    { 'user_123':    { costUSD: 0.087, calls: 7 } },
//   byFeature: { 'chat': { costUSD: 0.062, calls: 5 }, 'rag': { costUSD: 0.025, calls: 3 } },
//   period: { from: '2026-04-16T10:00:00Z', to: '2026-04-16T11:00:00Z' },
//   pricesUpdatedAt: '2026-04-22'   // date of the price data in use
// }

// Time-filtered reports
await tracker.getReport({ last: '24h' })          // last 24 hours
await tracker.getReport({ last: '7d' })           // last 7 days
await tracker.getReport({ since: '2026-04-01' })  // since a specific date
await tracker.getReport({ since: '2026-04-01', until: '2026-04-30' })

// Cost forecast — burn rate + projected daily/monthly spend
const forecast = await tracker.getCostForecast()
// { burnRatePerHour: 0.043, projectedDailyCostUSD: 1.03, projectedMonthlyCostUSD: 31.20, basedOnHours: 6 }

await tracker.getCostForecast({ windowHours: 1 })  // use last 1h for burn rate calculation

tracker.getModelInfo('gpt-4o')
// { input: 2.5, output: 10, cachedInput: 1.25, maxInputTokens: 128000 }
// Returns null if the model is unknown (synchronous)

await tracker.reset()                     // clear all data
await tracker.resetSession('session_abc') // clear one session
await tracker.exportJSON()                // full report as JSON string
await tracker.exportCSV()                 // all raw calls as CSV (RFC 4180)
```

---

## Price Resolution

Prices are resolved in this priority order:

1. **`customPrices`** — your own overrides, highest priority
2. **Remote `prices.json`** — fetched from GitHub, cached for 24h in `~/.tokenwatch/prices.json`
3. **Bundled `prices.json`** — always-present fallback, updated daily via GitHub Action

If a model is not found in any layer, cost is recorded as **$0** with a `console.warn`.

Prices are in **USD per 1 million tokens**.

---

## Pricing Data

`prices.json` bundles 200+ models across all providers. Each entry includes prices and context window size:

```json
{
  "gpt-4o":            { "input": 2.50, "output": 10.00, "cachedInput": 1.25,  "maxInputTokens": 128000 },
  "claude-sonnet-4-6": { "input": 3.00, "output": 15.00, "cachedInput": 0.30,  "cacheCreationInput": 3.75, "maxInputTokens": 1000000 },
  "gemini-2.5-pro":    { "input": 1.25, "output": 10.00,                        "maxInputTokens": 1048576 },
  "deepseek-chat":     { "input": 0.28, "output": 0.42,                         "maxInputTokens": 131072 }
}
```

Prices are updated every day via a GitHub Action that pulls from the [LiteLLM community model registry](https://github.com/BerriAI/litellm) and commits the updated `prices.json` to the repo. Users with `syncPrices: true` (the default) always receive fresh prices at runtime — no `npm update` needed.

---

## Storage

### In-memory (default)

```ts
const tracker = createTracker({ storage: 'memory' })
// Resets on process restart. Good for short-lived processes and testing.
```

### SQLite

For persistent tracking across restarts:

```bash
npm install better-sqlite3
```

```ts
const tracker = createTracker({ storage: 'sqlite' })
// Data stored in ~/.tokenwatch/usage.db
```

### PostgreSQL

```bash
npm install pg
```

```ts
import { Pool } from 'pg'
import { createTracker } from '@diogonzafe/tokenwatch'
import { PostgresStorage } from '@diogonzafe/tokenwatch/adapters'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const storage = new PostgresStorage(pool)
await storage.migrate()   // creates tokenwatch_usage table if it doesn't exist

const tracker = createTracker({ storage })
```

### MySQL / MariaDB

```bash
npm install mysql2
```

```ts
import mysql from 'mysql2/promise'
import { MySQLStorage } from '@diogonzafe/tokenwatch/adapters'

const pool = mysql.createPool({ uri: process.env.MYSQL_URL })
const storage = new MySQLStorage(pool)
await storage.migrate()

const tracker = createTracker({ storage })
```

### MongoDB

```bash
npm install mongodb
```

```ts
import { MongoClient } from 'mongodb'
import { MongoStorage } from '@diogonzafe/tokenwatch/adapters'

const client = new MongoClient(process.env.MONGO_URL!)
await client.connect()
const storage = new MongoStorage(client.db('myapp'))
await storage.createIndexes()  // optional but recommended

const tracker = createTracker({ storage })
```

### Custom adapter

Any object that implements `IStorage` works:

```ts
import type { IStorage, UsageEntry } from '@diogonzafe/tokenwatch'

class RedisStorage implements IStorage {
  record(entry: UsageEntry): void { /* ... */ }
  async getAll(): Promise<UsageEntry[]> { /* ... */ }
  async clearAll(): Promise<void> { /* ... */ }
  async clearSession(sessionId: string): Promise<void> { /* ... */ }
}

const tracker = createTracker({ storage: new RedisStorage() })
```

---

## Prompt Caching

OpenAI and Anthropic offer discounted pricing for cached prompt tokens. tokenwatch tracks these automatically — no changes needed at the call site.

**OpenAI** — cached reads billed at 50% of input price:
```ts
// prompt_tokens_details.cached_tokens is extracted automatically
const res = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: '...' }],
})
// report.byModel['gpt-4o'].tokens.cached shows how many tokens were served from cache
```

**Anthropic** — cache reads at 10% of input price, cache creation at 125%:
```ts
const res = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: [{ role: 'user', content: '...' }],
  // cache_read_input_tokens and cache_creation_input_tokens extracted from usage automatically
})
```

Cached token prices are included in `prices.json` for all models that support caching. You can also override them:
```ts
const tracker = createTracker({
  customPrices: {
    'my-model': { input: 2.50, output: 10.00, cachedInput: 1.25, cacheCreationInput: 3.13 }
  }
})
```

---

## Alerts & Webhooks

### Global threshold

```ts
const tracker = createTracker({
  alertThreshold: 5.00,                          // USD
  webhookUrl: 'https://hooks.slack.com/...',     // or Discord
})
// Webhook fires once when totalCostUSD crosses the threshold
```

Webhook payload:
```json
{ "text": "[tokenwatch] Alert: total cost reached $5.0012 USD (threshold: $5)" }
```

### Per-user and per-session budgets

```ts
const tracker = createTracker({
  budgets: {
    perUser: {
      threshold: 1.00,
      webhookUrl: 'https://hooks.slack.com/...',
      mode: 'once',   // default — fires once per user; use 'always' to fire on every call that exceeds
    },
    perSession: {
      threshold: 0.10,
      webhookUrl: 'https://hooks.slack.com/...',
    },
  },
})

await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [...],
  __userId: 'user_123',       // required for perUser alert to fire
  __sessionId: 'sess_abc',    // required for perSession alert to fire
})
```

Budget webhook payload:
```json
{ "text": "[tokenwatch] Budget alert: user \"user_123\" reached $1.0031 USD (threshold: $1)" }
```

---

## CLI

```bash
npx tokenwatch sync              # force update cached prices from remote
npx tokenwatch prices            # list all models and current prices
npx tokenwatch report            # show usage report from ~/.tokenwatch/usage.db
npx tokenwatch dashboard         # open local web dashboard (default port: 4242)
npx tokenwatch dashboard --port 8080
npx tokenwatch help              # show help
```

### `tokenwatch report`

Reads the local SQLite database and prints:

```
── tokenwatch report ──────────────────────────────
  Total cost:   $0.004231 USD
  Total tokens: 12,400 in / 3,100 out
  Period:       2026-04-16T09:00:00.000Z  →  2026-04-16T11:30:00.000Z

  By model:
    gpt-4o                         $0.003100  (8 calls)
    claude-sonnet-4-6              $0.001131  (3 calls)

  By user:
    user_123                       $0.004231  (11 calls)

  By feature:
    chat                           $0.002500  (5 calls)
    rag                            $0.001731  (6 calls)
───────────────────────────────────────────────────
```

### `tokenwatch dashboard`

Spins up a local web server and opens a dark-themed dashboard with real-time cost data:

- **Overview cards** — total cost, tokens, calls, burn rate per hour
- **Cost over time** — line chart bucketed by time (5min / 1h / 1day depending on filter)
- **Model breakdown** — doughnut chart + table with cost share per model
- **By user / feature** — collapsible tables, hidden when empty
- **Cost forecast** — projected daily and monthly spend based on recent burn rate
- **Time filter tabs** — 1h | 24h | 7d | 30d | All; updates chart and tables in real-time via SSE

Data updates automatically every 3 seconds without refreshing the page. Requires `storage: 'sqlite'` in your app and `better-sqlite3` installed. Zero external dependencies — pure Node.js HTTP server with Chart.js loaded from CDN.

---

## Production Usage

### Storage choice

| Setup | Recommended storage |
|---|---|
| Single process (monolith, lambda, single pod) | `'sqlite'` — zero config, persists across restarts |
| Multi-instance (Kubernetes, PaaS with ≥2 pods) | `PostgresStorage` / `MySQLStorage` / `MongoStorage` — shared, unified data |
| Ephemeral / testing | `'memory'` (default) — resets on restart |

### CI / test environments

Disable network calls and staleness warnings in CI:

```ts
const tracker = createTracker({
  syncPrices: false,          // skip remote price fetch — use bundled prices
  warnIfStaleAfterHours: 0,   // suppress staleness warning
})
```

### On-prem / air-gapped deployments

The daily GitHub Actions workflow updates `prices.json` and publishes a new npm package. Teams that cannot reach GitHub at runtime have two options:

1. **Pin and vendor** — copy `prices.json` from the installed package into your repo and commit it. Pass overrides via `customPrices` for any new models.
2. **Self-host the sync** — fork the `scripts/scrape-prices.mjs` script and run it on your own schedule, pointing to your internal registry.

Either way, set `syncPrices: false` so the library doesn't try to fetch from GitHub at runtime.

### Anomaly detection in production

Enable `anomalyDetection` to catch runaway agents or abuse early:

```ts
const tracker = createTracker({
  storage: new PostgresStorage(pool),
  anomalyDetection: {
    multiplierThreshold: 3,                       // alert if a call costs 3x above the rolling average
    webhookUrl: 'https://hooks.slack.com/...',
    windowHours: 24,                              // baseline window (default: 24h)
  },
})
```

---

## OpenTelemetry Exporter

Push tracked usage as metrics to any OTel-compatible backend (Datadog, Honeycomb, Grafana, New Relic, etc.) without changing your existing instrumentation:

```bash
npm install @opentelemetry/api
```

```ts
import { createTracker } from '@diogonzafe/tokenwatch'
import { OTelExporter } from '@diogonzafe/tokenwatch/exporters'

const tracker = createTracker({
  exporter: new OTelExporter(),   // uses the globally-registered MeterProvider
})
```

Four metrics are emitted per call, all with `model`, `session.id`, `user.id`, and `feature` attributes (optional fields omitted when absent):

| Metric | Type | Description |
|---|---|---|
| `tokenwatch.calls` | Counter | Number of LLM API calls |
| `tokenwatch.input_tokens` | Counter | Input tokens (includes cached + cache-creation) |
| `tokenwatch.output_tokens` | Counter | Output tokens |
| `tokenwatch.cost_usd` | Histogram | Cost per call in USD |

You must configure a `MeterProvider` before creating the exporter (e.g. using the OpenTelemetry SDK). `OTelExporter` has no compile-time dependency on `@opentelemetry/api` — it resolves it at runtime and throws a helpful error if the package is not installed.

Custom meter name:

```ts
new OTelExporter({ meterName: 'my-service' })
```

---

## Privacy & Security

- Prompt and response **content is never read or stored** — only token counts and model names
- API keys are **never accessed** by tokenwatch — they remain solely in the provider client
- SQLite, Postgres, MySQL, and MongoDB data stays **entirely in your own infrastructure** — nothing is transmitted to external services
- The wrapper is a thin `Proxy` with **no outbound network calls** of its own (only the daily price sync script fetches external data)

---

## TypeScript

`__sessionId`, `__userId`, and `__feature` are typed via the `TrackingMeta` interface, which is automatically merged into the `create` params type by the wrapper. In most setups they just work with no cast required.

If you hit a type error (e.g. with stricter SDK versions), use `as Record<string, unknown>`:

```ts
await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [],
  __sessionId: 'sess-1',
  __feature: 'chat',
} as Record<string, unknown>)
```

`TrackingMeta` is exported if you need to annotate your own helper types:

```ts
import type { TrackingMeta } from '@diogonzafe/tokenwatch'

type MyParams = { model: string; messages: Message[] } & TrackingMeta
```

---

## Behaviour Guarantees

- `__sessionId`, `__userId`, and `__feature` are **stripped before** the request reaches the API
- The response object returned is **identical** to the original SDK response
- `track()` is **synchronous and non-blocking** — negligible sub-millisecond overhead; no proxy server or network hop
- If the API call **fails**, no cost is recorded and the original error is re-thrown unchanged
- Streaming is fully supported — usage is accumulated from the final stream event
- Database writes from `record()` are **fire-and-forget** — a storage failure never interrupts your API call

---

## License

MIT
