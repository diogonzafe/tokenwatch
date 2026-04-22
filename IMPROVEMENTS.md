# Improvement Ideas — @diogonzafe/tokenwatch

Based on competitive research across Langfuse, Helicone, LangSmith, Portkey, LiteLLM, LLMetrics, OpenLLMetry and others.

---

## Competitive Positioning

| Tool | Type | Weakness vs. tokenwatch |
|---|---|---|
| Langfuse | OSS + SaaS | Heavy setup, not zero-code |
| Helicone | Proxy SaaS | Maintenance mode (acquired), proxy adds latency |
| LangSmith | SaaS | LangChain lock-in, per-user pricing |
| Portkey | Gateway OSS | Requires gateway deployment |
| LiteLLM | Proxy OSS | Python-only |
| LLMetrics | npm + SaaS | Proprietary cloud dashboard, no self-host |
| llm-cost | npm | Abandoned 2 years ago, static prices |
| OpenLLMetry | OSS | Requires existing APM infrastructure |

**tokenwatch unique advantages:** zero-code, zero-proxy, zero-cloud, multi-provider, daily auto-updated prices, fully self-hosted.

---

## Feature Ideas

### Priority 1 — Immediate Differentiators

#### 1. ~~Reasoning token tracking (o1 / o3 / Claude thinking)~~ ✅ Implemented in v0.2.0
Reasoning models have a third token category (`reasoning_tokens`) that no simple wrapper currently tracks. OpenAI already exposes this in `usage.completion_tokens_details.reasoning_tokens`. Anthropic exposes thinking tokens separately in extended thinking mode.

**Implementation sketch:**
```ts
// Extended ModelStats in Report
interface ModelStats {
  costUSD: number
  calls: number
  tokens: {
    input: number
    output: number
    reasoning: number   // NEW
    cached: number      // NEW (see #2)
  }
}
```

**Impact:** o1/o3/o4 models are 5-10x more expensive than GPT-4o. Without reasoning token tracking, cost attribution is wrong.

---

#### 2. Cached token support (prompt caching)
OpenAI and Anthropic offer discounts for cached prompt tokens. These are priced differently (OpenAI: 50% off, Anthropic: 90% off). Currently tokenwatch records them at full price, overstating actual cost.

**OpenAI:** `usage.prompt_tokens_details.cached_tokens`
**Anthropic:** `usage.cache_read_input_tokens` + `usage.cache_creation_input_tokens`

**Implementation sketch:**
```ts
// prices.json entry
"gpt-4o": {
  "input": 2.50,
  "output": 10.00,
  "cachedInput": 1.25,    // NEW — 50% discount
  "maxInputTokens": 128000
}
```

**Impact:** Teams using prompt caching can see 30-50% lower real costs than what tokenwatch currently reports.

---

#### 3. Per-user and per-session budget alerts
Today `alertThreshold` is global. Add the ability to set spending limits per individual user or session — essential for SaaS products where you want to cap each customer's spend independently.

**API sketch:**
```ts
const tracker = createTracker({
  budgets: {
    perUser: { threshold: 1.00, webhookUrl: '...' },       // per userId
    perSession: { threshold: 0.10, webhookUrl: '...' },    // per sessionId
  }
})
```

**Impact:** Prevents a single runaway user from consuming the entire budget. No competitor offers this as a simple library feature.

---

#### 4. `tracker.getCostForecast()`
Based on the burn rate of the last N hours, project the cost to end of day and end of month. Simple to implement with existing data, extremely useful for SaaS cost management.

**API sketch:**
```ts
tracker.getCostForecast()
// {
//   burnRatePerHour: 0.043,
//   projectedDailyCostUSD: 1.03,
//   projectedMonthlyCostUSD: 31.20,
//   basedOnHours: 6
// }
```

**Impact:** Turns reactive monitoring into proactive planning. No simple npm library offers this.

---

#### 5. ~~Feature/label tagging (`__feature`)~~ ✅ Implemented in v0.2.0
Beyond `sessionId` and `userId`, allow tagging calls by product feature. The report gains a `byFeature` breakdown identical to `byModel` and `byUser`.

**API sketch:**
```ts
await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [...],
  __sessionId: 'sess_abc',
  __feature: 'summarizer',   // NEW
})

tracker.getReport().byFeature
// {
//   'summarizer': { costUSD: 0.42, calls: 15 },
//   'chatbot':    { costUSD: 1.20, calls: 48 },
// }
```

**Impact:** Lets product teams understand which features drive LLM costs without any extra instrumentation.

---

### Priority 2 — Polish & Ecosystem

#### 14. ~~Embeddings support in `wrapOpenAI`~~ ✅ Implemented in v0.2.0

`wrapOpenAI` currently only intercepts `chat.completions.create`. Users calling `openai.embeddings.create` (RAG pipelines, batch jobs, semantic search) must call `track()` manually — and the docs don't mention this at all.

**What to do:**
- Extend `wrapOpenAI` to also proxy `openai.embeddings.create`
- Record `inputTokens = usage.total_tokens`, `outputTokens = 0` (embeddings have no output tokens)
- Update docs to explicitly state which endpoints are wrapped and which require manual `track()`

**API sketch:**
```ts
// Today — requires manual track():
const res = await openai.embeddings.create({ model: 'text-embedding-3-small', input: texts })
tracker.track({ model: 'text-embedding-3-small', inputTokens: res.usage.total_tokens, outputTokens: 0 })

// After — automatic:
const wrappedOpenAI = wrapOpenAI(new OpenAI(), tracker)
await wrappedOpenAI.embeddings.create({ model: 'text-embedding-3-small', input: texts })
// → tracked automatically
```

**Impact:** RAG and batch pipelines are common heavy consumers. Silent omission leads to underreported costs with no warning.

---

#### 15. Agent framework integration guide (Mastra, Vercel AI SDK, LlamaIndex)

`wrapOpenAI` works when you hold the raw OpenAI client. Frameworks like Mastra and LlamaIndex use the Vercel AI SDK or their own HTTP layer internally — the client is never exposed, so wrapping it isn't possible. The README's "no changes required" claim is misleading for this group.

**What to do:**
- Add a dedicated "Agent Frameworks" section to the docs explaining when `wrapOpenAI` works and when it doesn't
- Document the `track()` manual pattern with the `usage` object that these frameworks return
- For Mastra specifically: intercept at the `onFinish` / `onStepFinish` callback where `usage` is available

**Docs sketch:**
```ts
// Mastra / Vercel AI SDK — manual track() after stream
const result = await streamText({ model, messages, onFinish: ({ usage }) => {
  tracker.track({
    model: 'claude-sonnet-4-6',
    inputTokens: usage.promptTokens,
    outputTokens: usage.completionTokens,
    sessionId,
  })
}})
```

**Impact:** Mastra, LlamaIndex, CrewAI users hit this wall immediately. Clear docs prevent them from concluding the library "doesn't work" with their stack.

---

#### 16. Lazy / singleton initialization pattern for module-level imports

When users call `getTracker()` at module load time (a common Node.js singleton pattern), it fails in Jest and other test environments where modules are imported before `createTracker()` has been called. The library gives no guidance on this.

**What to do:**
- Document a safe lazy singleton pattern
- Consider exporting a `createLazyTracker()` helper that returns a no-op proxy until `init()` is called, and defers all calls until then

**Pattern sketch:**
```ts
// tokenwatch-tracker.ts — safe for module-level import
let _tracker: Tracker | null = null

export function initTracker(config: TrackerConfig): void {
  _tracker = createTracker(config)
}

export function getTracker(): Tracker {
  if (!_tracker) {
    // Return no-op in test/uninitialized environments
    return createTracker({ syncPrices: false })
  }
  return _tracker
}
```

**Impact:** Reduces integration friction for apps that initialise tracker once at startup and import it across many modules — the most common real-world pattern.

---

#### 6. OpenTelemetry exporter
An optional export adapter that emits spans to any OTel backend (Datadog, Honeycomb, Grafana, New Relic). The library stays fully standalone but integrates into existing enterprise APM stacks.

**API sketch:**
```ts
import { createTracker } from '@diogonzafe/tokenwatch'
import { OtelExporter } from '@diogonzafe/tokenwatch/exporters'

const tracker = createTracker({
  exporter: new OtelExporter({ endpoint: 'http://otel-collector:4318' })
})
```

**Impact:** Bridges the gap between "simple zero-code wrapper" and "enterprise APM integration" without requiring framework lock-in.

---

#### 7. Cheaper model suggestions
After each call, compare the cost with the cheapest equivalent model available in `prices.json` and log a hint. Opt-in via config.

**API sketch:**
```ts
const tracker = createTracker({ suggestions: true })

// After a gpt-4o call costing $0.05:
// [tokenwatch] Suggestion: gpt-4o-mini could handle this for ~$0.002 (96% cheaper)
```

**Impact:** Teams report 50-70% cost reduction after routing optimisation. This makes it automatic and visible.

---

#### 8. LangChain callback handler
A `TokenwatchCallbackHandler` compatible with LangChain's callback system, so LangChain users get automatic cost tracking without changing any of their chain/agent code.

**API sketch:**
```ts
import { TokenwatchCallbackHandler } from '@diogonzafe/tokenwatch/langchain'

const tracker = createTracker()
const chain = new LLMChain({
  llm: new ChatOpenAI({ model: 'gpt-4o' }),
  callbacks: [new TokenwatchCallbackHandler(tracker)],
})
```

**Impact:** LangChain has millions of users. Zero integration friction for this segment.

---

#### 9. Time-filtered reports
Allow filtering `getReport()` by time period. With SQLite and accumulated history this becomes essential.

**API sketch:**
```ts
tracker.getReport({ since: '2026-04-16T00:00:00Z' })
tracker.getReport({ since: '2026-04-01', until: '2026-04-30' })  // monthly
tracker.getReport({ last: '24h' })
tracker.getReport({ last: '7d' })
```

**Impact:** Currently `getReport()` returns everything. As SQLite accumulates months of data this becomes unusable without filtering.

---

#### 10. Semantic request caching
Cache responses for semantically similar requests using vector embeddings or a simpler hashing approach. Track hit rate and estimated savings.

**API sketch:**
```ts
const tracker = createTracker({
  cache: {
    strategy: 'semantic',    // or 'exact'
    ttlSeconds: 3600,
    store: 'memory',         // or 'redis'
    similarityThreshold: 0.95,
  }
})

tracker.getReport().cache
// { hits: 42, misses: 108, savedUSD: 1.87, hitRate: '28%' }
```

**Impact:** Proven 40-60% cost reduction in production. No simple npm library offers this today.

---

### Priority 3 — Enterprise / Future

#### 11. Cost anomaly detection
Alert when a user or model spends 3x above their historical average — useful for detecting infinite loops, buggy agents, or abuse.

```ts
const tracker = createTracker({
  anomalyDetection: {
    enabled: true,
    multiplierThreshold: 3,   // alert if cost > 3x rolling average
    webhookUrl: '...',
  }
})
```

---

#### 12. Cost allocation / chargeback rules
Define rules to distribute costs between departments or customers. Useful for multi-tenant SaaS with internal showback/chargeback requirements.

```ts
const tracker = createTracker({
  costAllocation: {
    rules: [
      { match: { userId: /^premium_/ }, chargeRate: 0.80 },  // charge 80% to premium users
      { match: { feature: 'internal' }, chargeRate: 0 },      // internal calls are free
    ]
  }
})
```

---

#### 13. Local web dashboard (`tokenwatch dashboard`)
A CLI command that spins up a local Express/HTTP server rendering a simple HTML dashboard with charts for cost over time, top models, top users. No cloud, no SaaS, no account.

```bash
npx tokenwatch dashboard        # opens http://localhost:4242
npx tokenwatch dashboard --port 8080
```

**Impact:** The last missing piece for teams that want full visibility without any external service.

---

## Summary Table

| # | Feature | Effort | Impact | Unique? | Status |
|---|---|---|---|---|---|
| 1 | Reasoning token tracking | Low | High | Yes | ✅ v0.2.0 |
| 2 | Cached token pricing | Medium | High | Yes | |
| 3 | Per-user/session budgets | Medium | High | Yes | |
| 4 | Cost forecast | Low | High | Yes | |
| 5 | Feature tagging (`__feature`) | Low | High | Yes | ✅ v0.2.0 |
| 6 | OpenTelemetry exporter | Medium | Medium | No | |
| 7 | Cheaper model suggestions | Low | Medium | No | |
| 8 | LangChain callback handler | Medium | High | No | |
| 9 | Time-filtered reports | Low | Medium | No | |
| 10 | Semantic caching | High | High | No | |
| 11 | Anomaly detection | High | Medium | No | |
| 12 | Cost allocation rules | High | Low | No | |
| 13 | Local web dashboard | High | High | Partial | |
| 14 | Embeddings support in `wrapOpenAI` | Low | High | No | ✅ v0.2.0 |
| 15 | Agent framework integration guide | Low | High | No | |
| 16 | Lazy / singleton init pattern | Low | Medium | No | |

---

## ChatGPT Review — Identified Gaps

*External review received 2026-04-16. Items below are improvements to address before a v1.0 stable release.*

---

### G1. Fix misleading "zero overhead / zero latency" documentation claim

The current README/docs claim zero overhead, but every call goes through a `Proxy` trap, async wrapper, and optional SQLite write. This is negligible in practice but not literally zero.

**Fix:** Replace "zero overhead" language with "negligible overhead" or "sub-millisecond instrumentation". Add a note that the wrapper is purely in-process with no proxy server or network hop.

**Why it matters:** A fintech or high-throughput user reading the docs will test this claim. If they benchmark it and find any overhead they'll distrust the library entirely.

---

### G2. Price sync reliability — staleness warnings and multi-source validation

LiteLLM JSON is community-maintained and can lag actual provider billing by hours or days. For serious cost attribution, undetected price drift leads to silent billing discrepancies.

**Improvements:**
- Surface `updated_at` from `prices.json` in `getReport()` so callers can see how fresh the data is
- Add a `warnIfStaleAfterHours` config option (default: 48h) that logs a warning when prices are old
- Consider cross-validating against a second source (e.g. OpenAI's public `/models` pricing API) for the most critical models

**API sketch:**
```ts
tracker.getReport().pricesLastUpdated  // "2026-04-15"
tracker.getReport().pricesStalenessWarning  // true if > 48h old

const tracker = createTracker({ warnIfStaleAfterHours: 24 })
```

---

### G3. ~~Postgres / centralised database backend for horizontal scaling~~ ✅ Implemented in v0.2.0

SQLite is a single-file, single-process database. In multi-instance deployments (e.g. a Node.js app on 3 pods in Kubernetes), each instance writes to its own file and reports are never unified.

**Improvements:**
- Introduce a `storage` adapter interface so backends are pluggable
- Ship an optional `@diogonzafe/tokenwatch-pg` package (or a built-in `postgres` adapter) for teams running horizontally-scaled deployments

**API sketch:**
```ts
import { PostgresAdapter } from '@diogonzafe/tokenwatch/adapters'

const tracker = createTracker({
  storage: new PostgresAdapter({ connectionString: process.env.DATABASE_URL })
})
```

**Why it matters:** Teams using Kubernetes, Railway, Render, or any PaaS with multiple instances currently get fragmented, siloed cost data — making the tool unusable for production fleet tracking.

---

### G4. Security and privacy documentation section

There is no explicit statement in the README about what data tokenwatch does and does not capture. Security-conscious teams (and enterprise buyers) will reject an un-audited library without this.

**Add a "Privacy & Security" section to the README covering:**
- Prompt and response content are **never** read or stored — only token counts and model names
- API keys are **never** accessed by tokenwatch — they remain solely in the provider client
- SQLite data stays entirely local — nothing is transmitted to external services
- The wrapper is a thin `Proxy` with no network calls of its own (only the prices sync script fetches external data)

**Why it matters:** This is a blocker for enterprise adoption. Even if everything above is already true, it must be explicitly stated.

---

### G5. Production readiness guidance

The documentation currently focuses on quick-start usage but gives no guidance on production deployment patterns.

**Add a "Production Usage" section (or expand the README) covering:**
- SQLite is best for single-process / single-instance apps (lambdas, monoliths, small services)
- For multi-instance deployments, use the `memory` adapter + an external aggregation layer, or wait for the Postgres adapter (G3)
- Recommend setting `syncPrices: true` in production and `false` in test/CI environments
- Explain the daily GitHub Actions price sync — users deploying on-prem need to know they must run their own sync or pin a `prices.json` version

---

| # | Gap | Effort | Impact | Priority | Status |
|---|---|---|---|---|---|
| G1 | Fix "zero latency" docs claim | Low | Medium | Immediate | |
| G2 | Price staleness warnings | Low | High | High | |
| G3 | Postgres / pluggable storage | High | High | Medium | ✅ v0.2.0 |
| G4 | Privacy & security README section | Low | High | Immediate | ✅ done |
| G5 | Production readiness docs | Low | Medium | High | |

---

## Real-World Integration Feedback — 2026-04-21

*Feedback from a production integration: Express + Mastra (Vercel AI SDK) + PostgresStorage + RAG pipeline.*

### Key friction points reported

**F1. `wrapOpenAI` scope not documented** — Users expect all OpenAI endpoints to be wrapped. In practice only `chat.completions` is covered. Embeddings in RAG/batch jobs require manual `track()` with no warning in the docs. → Already tracked as **#14**.

**F2. Agent frameworks require manual `track()`** — Mastra, LlamaIndex, and other frameworks that use Vercel AI SDK internally never expose the raw OpenAI client. The `wrapOpenAI` approach doesn't apply. The README's "no changes required to existing code" claim is misleading for this audience. → Already tracked as **#15**.

**F3. Module-level singleton breaks in Jest** — Calling `getTracker()` at module load time (before `createTracker()` runs) fails silently in test environments. The library gives no guidance. A no-op/lazy init pattern would solve this. → Already tracked as **#16**.

**F4. TypeScript `__sessionId` / `__userId` type friction** — In strict TypeScript contexts, the extra fields may appear as `never` depending on the SDK version. Normal for transparent wrapper libraries, but worth a note in the docs (or a re-export of the augmented type).

### What worked well (keep these)

- `PostgresStorage` + `migrate()` — straightforward, aligned with docs
- `wrapOpenAI` for direct SDK usage (pitch-chat, RapidMCP) — zero friction
- `record()` fire-and-forget — no latency impact confirmed in production
- `customPrices` for overrides — practical for new/unreleased models
- Privacy model (no prompts stored) — cited as a differentiator for enterprise use
