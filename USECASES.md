# Use Cases — @diogonzafe/tokenwatch

## 1. Per-user cost tracking (multi-tenant SaaS)

You have a SaaS app where each user can access your AI feature. You want to know how much each one is costing you.

```ts
import { createTracker, wrapOpenAI } from '@diogonzafe/tokenwatch'
import OpenAI from 'openai'

const tracker = createTracker()
const openai = wrapOpenAI(new OpenAI(), tracker)

// In your API route
app.post('/chat', async (req, res) => {
  const { userId, message } = req.body

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: message }],
    __userId: userId,
  })

  res.json({ reply: response.choices[0].message.content })
})

// Admin route — see how much each user has spent
app.get('/admin/costs', (req, res) => {
  const report = tracker.getReport()
  res.json(report.byUser)
  // {
  //   'user_001': { costUSD: 0.42, calls: 12 },
  //   'user_002': { costUSD: 0.08, calls: 3 },
  // }
})
```

---

## 2. Budget alert — block requests when limit is reached

You don't want to spend more than $10/day on API calls. When the limit is hit, fire a webhook to your Slack.

```ts
const tracker = createTracker({
  alertThreshold: 10.00,
  webhookUrl: 'https://hooks.slack.com/services/...',
})

// Webhook fires automatically when totalCostUSD >= 10
// Payload: { "text": "[tokenwatch] Alert: total cost reached $10.0031 USD (threshold: $10)" }
```

To block requests after the limit, check before each call:

```ts
function isOverBudget(): boolean {
  return tracker.getReport().totalCostUSD >= 10.00
}

app.post('/chat', async (req, res) => {
  if (isOverBudget()) {
    return res.status(429).json({ error: 'Daily budget exceeded' })
  }
  // ...
})
```

---

## 3. Per-conversation session tracking

Each user conversation is a separate session. You want to know the cost of each thread.

```ts
import { randomUUID } from 'node:crypto'

const sessionId = randomUUID()

// All calls in this conversation
for (const message of conversation) {
  await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: message }],
    __sessionId: sessionId,
  })
}

const report = tracker.getReport()
console.log(report.bySession[sessionId])
// { costUSD: 0.023, calls: 4 }

// Clear only this session without affecting others
tracker.resetSession(sessionId)
```

---

## 4. Compare cost across models

You are evaluating which model is the most cost-effective for your use case.

```ts
const models = ['gpt-4o', 'gpt-4o-mini', 'claude-haiku-4-5', 'gemini-2.5-flash']
const prompt = 'Summarise this document in 3 bullet points: ...'

for (const model of models) {
  tracker.resetSession(model)

  await openai.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    __sessionId: model,
  })
}

const report = tracker.getReport()
for (const [model, stats] of Object.entries(report.bySession)) {
  console.log(`${model}: $${stats.costUSD.toFixed(6)} (${stats.calls} call)`)
}
// gpt-4o:           $0.002500
// gpt-4o-mini:      $0.000150
// claude-haiku-4-5: $0.000800
// gemini-2.5-flash: $0.000200
```

---

## 5. Check context window before sending

Before making a call, verify your input fits the model's context window — without checking the docs.

```ts
function countTokens(text: string): number {
  // simple estimate: ~4 chars per token
  return Math.ceil(text.length / 4)
}

async function safeSend(model: string, prompt: string) {
  const info = tracker.getModelInfo(model)

  if (info?.maxInputTokens) {
    const estimated = countTokens(prompt)
    if (estimated > info.maxInputTokens * 0.9) {
      throw new Error(
        `Prompt too long: ~${estimated} tokens, model limit is ${info.maxInputTokens}`
      )
    }
  }

  return openai.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
  })
}
```

---

## 6. Export daily cost report to CSV

You have a nightly job that exports the day's costs for analysis.

```ts
import { writeFileSync } from 'node:fs'

// Runs all day with createTracker({ storage: 'sqlite' })
// At end of day:

const date = new Date().toISOString().slice(0, 10)
const csv = tracker.exportCSV()

writeFileSync(`reports/costs-${date}.csv`, csv)
// timestamp,model,inputTokens,outputTokens,costUSD,sessionId,userId
// 2026-04-16T08:12:33Z,gpt-4o,1200,340,0.00640000,sess_1,user_001
// 2026-04-16T08:15:01Z,claude-sonnet-4-6,800,210,0.00555000,sess_2,user_002

tracker.reset()
```

---

## 7. DeepSeek as a cheaper alternative to GPT-4o

You have code using GPT-4o but want to test DeepSeek without changing your logic.

```ts
import OpenAI from 'openai'
import { wrapDeepSeek } from '@diogonzafe/tokenwatch'

const deepseek = wrapDeepSeek(
  new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY,
  }),
  tracker,
)

// Same interface as the OpenAI wrapper
const res = await deepseek.chat.completions.create({
  model: 'deepseek-chat',
  messages: [{ role: 'user', content: 'Hello' }],
  __userId: 'user_001',
})

// Cost: $0.28/1M input vs $2.50/1M for gpt-4o — ~9x cheaper
```

---

## 8. Multi-provider with a shared tracker

Your app uses multiple providers at the same time. You want a single unified report.

```ts
import { createTracker, wrapOpenAI, wrapAnthropic, wrapGemini } from '@diogonzafe/tokenwatch'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

const tracker = createTracker()

const openai    = wrapOpenAI(new OpenAI(), tracker)
const anthropic = wrapAnthropic(new Anthropic(), tracker)
const gemini    = wrapGemini(new GoogleGenerativeAI(process.env.GEMINI_API_KEY), tracker)

// All providers share the same tracker
// getReport() aggregates everything together
const report = tracker.getReport()
console.log(`Total: $${report.totalCostUSD.toFixed(4)}`)
console.log(report.byModel)
// {
//   'gpt-4o':            { costUSD: 0.05, calls: 10 },
//   'claude-sonnet-4-6': { costUSD: 0.03, calls: 5  },
//   'gemini-2.5-flash':  { costUSD: 0.01, calls: 8  },
// }
```

---

## 9. Custom prices for self-hosted or fine-tuned models

You have a fine-tuned or self-hosted model with different costs than the defaults.

```ts
const tracker = createTracker({
  customPrices: {
    'gpt-4o-finetuned-v1':     { input: 3.75, output: 15.00 }, // fine-tune pricing
    'llama-3-70b-self-hosted': { input: 0.05, output: 0.10  }, // your hardware cost
  },
})
```

---

## 10. Persistent tracking across restarts with SQLite

For long-running applications where you want accumulated history.

```ts
// npm install better-sqlite3

const tracker = createTracker({ storage: 'sqlite' })
// Data stored in ~/.tokenwatch/usage.db
// Survives process restarts

// After a week of usage:
const report = tracker.getReport()
console.log(`Total cost this week: $${report.totalCostUSD.toFixed(2)}`)
```
