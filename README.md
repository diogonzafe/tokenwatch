# @diogonzafe/tokenwatch

Transparent TypeScript wrapper that intercepts LLM API calls and tracks cost in real-time by session, user and model — without changing anything in your existing code.

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
```

---

## Setup

```ts
import { createTracker } from '@diogonzafe/tokenwatch'

const tracker = createTracker({
  // All fields are optional
  storage: 'memory',           // 'memory' (default) | 'sqlite'
  alertThreshold: 1.00,        // USD — fires webhookUrl when exceeded
  webhookUrl: 'https://...',   // Discord / Slack webhook
  syncPrices: true,            // fetch fresh prices from GitHub (default: true)
  customPrices: {
    'my-model': { input: 0.50, output: 1.50 }  // USD per 1M tokens
  }
})
```

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
})
```

---

## Google Gemini

```ts
import { GoogleGenerativeAI } from '@google/generative-ai'
import { wrapGemini } from '@diogonzafe/tokenwatch'

const genAI = wrapGemini(new GoogleGenerativeAI(process.env.GEMINI_API_KEY!), tracker)

const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
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

## Reports

```ts
tracker.getReport()
// {
//   totalCostUSD: 0.087,
//   totalTokens: { input: 24000, output: 6000 },
//   byModel: {
//     'gpt-4o': { costUSD: 0.062, calls: 5, tokens: { input: 20000, output: 5000 } },
//     'claude-sonnet-4-6': { costUSD: 0.025, calls: 2, tokens: { input: 4000, output: 1000 } }
//   },
//   bySession: { 'session_abc': { costUSD: 0.045, calls: 4 } },
//   byUser:    { 'user_123':    { costUSD: 0.087, calls: 7 } },
//   period: { from: '2026-04-16T10:00:00Z', to: '2026-04-16T11:00:00Z' }
// }

tracker.getModelInfo('gpt-4o')
// { input: 2.5, output: 10, maxInputTokens: 128000 }
// Returns null if the model is unknown

tracker.reset()                     // clear all data
tracker.resetSession('session_abc') // clear one session
tracker.exportJSON()                // full report as JSON string
tracker.exportCSV()                 // all calls as CSV string
```

---

## Price Resolution

Prices are resolved in this priority order:

1. **`customPrices`** — your own overrides, highest priority
2. **Remote `prices.json`** — fetched from GitHub, cached for 24h in `~/.tokenwatch/prices.json`
3. **Bundled `prices.json`** — always-present fallback, updated weekly via GitHub Action

If a model is not found in any layer, cost is recorded as **$0** with a `console.warn`.

Prices are in **USD per 1 million tokens**.

---

## Pricing Data

`prices.json` bundles 200+ models across all providers. Each entry includes prices and context window size:

```json
{
  "gpt-4o":            { "input": 2.50,  "output": 10.00, "maxInputTokens": 128000 },
  "claude-sonnet-4-6": { "input": 3.00,  "output": 15.00, "maxInputTokens": 1000000 },
  "gemini-2.5-pro":    { "input": 1.25,  "output": 10.00, "maxInputTokens": 1048576 },
  "deepseek-chat":     { "input": 0.28,  "output": 0.42,  "maxInputTokens": 131072 }
}
```

Prices are updated every Monday via a GitHub Action that pulls from the [LiteLLM community model registry](https://github.com/BerriAI/litellm). New models are auto-discovered — no manual updates needed.

---

## SQLite Storage

For persistent tracking across restarts:

```bash
npm install better-sqlite3
```

```ts
const tracker = createTracker({ storage: 'sqlite' })
// Data stored in ~/.tokenwatch/usage.db
```

---

## Alerts & Webhooks

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

---

## CLI

```bash
npx tokenwatch sync     # force update cached prices from remote
npx tokenwatch prices   # list all models and current prices
npx tokenwatch report   # show last saved report (SQLite)
npx tokenwatch help     # show help
```

---

## Behaviour Guarantees

- `__sessionId` and `__userId` are **stripped before** the request reaches the API
- The response object returned is **identical** to the original SDK response
- Tracking operations are **synchronous and non-blocking** — zero latency added
- If the API call **fails**, no cost is recorded and the original error is re-thrown unchanged
- Streaming is fully supported — usage is accumulated from the final stream event

---

## License

MIT
