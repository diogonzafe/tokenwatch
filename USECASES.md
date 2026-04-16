# Use Cases — @diogonzafe/tokenwatch

## 1. Controlo de custos por utilizador (SaaS multi-tenant)

Tens uma aplicação SaaS onde cada utilizador pode usar a tua feature de IA. Queres saber quanto cada um está a custar.

```ts
import { createTracker, wrapOpenAI } from '@diogonzafe/tokenwatch'
import OpenAI from 'openai'

const tracker = createTracker()
const openai = wrapOpenAI(new OpenAI(), tracker)

// Numa rota da tua API
app.post('/chat', async (req, res) => {
  const { userId, message } = req.body

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: message }],
    __userId: userId,
  })

  res.json({ reply: response.choices[0].message.content })
})

// Rota de admin — ver quanto cada utilizador gastou
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

## 2. Alerta de budget — cortar acesso quando o limite é atingido

Não queres gastar mais de $10/dia em chamadas à API. Quando o limite é atingido, dispara um webhook para o teu Slack.

```ts
const tracker = createTracker({
  alertThreshold: 10.00,
  webhookUrl: 'https://hooks.slack.com/services/...',
})

// O webhook é disparado automaticamente quando totalCostUSD >= 10
// Payload: { "text": "[tokenwatch] Alert: total cost reached $10.0031 USD (threshold: $10)" }
```

Para bloquear chamadas após o limite, verifica antes de cada request:

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

## 3. Tracking por sessão de conversa

Cada conversa do utilizador é uma sessão separada. Queres saber o custo de cada thread.

```ts
import { randomUUID } from 'node:crypto'

const sessionId = randomUUID()

// Todas as chamadas desta conversa
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

// Limpar só esta sessão sem afectar as outras
tracker.resetSession(sessionId)
```

---

## 4. Comparar custo entre modelos

Estás a avaliar qual o modelo mais económico para o teu caso de uso.

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
// gpt-4o:          $0.002500
// gpt-4o-mini:     $0.000150
// claude-haiku-4-5: $0.000800
// gemini-2.5-flash: $0.000200
```

---

## 5. Verificar janela de contexto antes de enviar

Antes de fazer a chamada, verifica se o teu input cabe no contexto do modelo — sem consultar documentação.

```ts
function countTokens(text: string): number {
  // estimativa simples: ~4 chars por token
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

## 6. Exportar relatório diário para CSV

Tens um job nocturno que exporta os custos do dia para análise.

```ts
import { writeFileSync } from 'node:fs'

// Corre todo o dia com createTracker({ storage: 'sqlite' })
// No fim do dia:

const date = new Date().toISOString().slice(0, 10)
const csv = tracker.exportCSV()

writeFileSync(`reports/costs-${date}.csv`, csv)
// timestamp,model,inputTokens,outputTokens,costUSD,sessionId,userId
// 2026-04-16T08:12:33Z,gpt-4o,1200,340,0.00640000,sess_1,user_001
// 2026-04-16T08:15:01Z,claude-sonnet-4-6,800,210,0.00555000,sess_2,user_002

tracker.reset()
```

---

## 7. DeepSeek como alternativa económica ao GPT-4o

Tens código que usa GPT-4o mas queres testar o DeepSeek sem alterar a lógica.

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

// Mesma interface que o OpenAI wrapper
const res = await deepseek.chat.completions.create({
  model: 'deepseek-chat',
  messages: [{ role: 'user', content: 'Hello' }],
  __userId: 'user_001',
})

// Custo: $0.28/1M input vs $2.50/1M do gpt-4o — ~9x mais barato
```

---

## 8. Multi-provider com tracker partilhado

O teu app usa vários providers ao mesmo tempo. Queres um relatório unificado.

```ts
import { createTracker, wrapOpenAI, wrapAnthropic, wrapGemini } from '@diogonzafe/tokenwatch'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

const tracker = createTracker()

const openai    = wrapOpenAI(new OpenAI(), tracker)
const anthropic = wrapAnthropic(new Anthropic(), tracker)
const gemini    = wrapGemini(new GoogleGenerativeAI(process.env.GEMINI_API_KEY), tracker)

// Cada provider usa o mesmo tracker
// getReport() agrega tudo junto
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

## 9. Preços custom para modelos self-hosted ou fine-tuned

Tens um modelo fine-tuned ou self-hosted com custos diferentes dos padrão.

```ts
const tracker = createTracker({
  customPrices: {
    'gpt-4o-finetuned-v1': { input: 3.75, output: 15.00 }, // fine-tune tem preço diferente
    'llama-3-70b-self-hosted': { input: 0.05, output: 0.10 }, // custo do teu hardware
  },
})
```

---

## 10. Persistência entre restarts com SQLite

Para aplicações de longa duração onde queres histórico acumulado.

```ts
// npm install better-sqlite3

const tracker = createTracker({ storage: 'sqlite' })
// Dados guardados em ~/.tokenwatch/usage.db
// Sobrevivem a restarts do processo

// Após uma semana de uso:
const report = tracker.getReport()
console.log(`Custo total da semana: $${report.totalCostUSD.toFixed(2)}`)
```
