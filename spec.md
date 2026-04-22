# llm-cost-tracker

## Objetivo
Lib npm em TypeScript que funciona como wrapper transparente para interceptar
chamadas a LLMs (OpenAI, Anthropic, Google Gemini, DeepSeek) e rastrear custo
em tempo real por sessão, usuário e modelo — sem alterar nada no código existente
do usuário.

## Stack
- TypeScript 5.x com ESM
- Node.js 20+
- tsup para build (dual CJS + ESM)
- vitest para testes
- zod para validação de config
- Sem dependências obrigatórias em runtime

## Estrutura de pastas
src/
  providers/
    openai.ts         # wrapper do cliente OpenAI
    anthropic.ts      # wrapper do cliente Anthropic
    gemini.ts         # wrapper do cliente Google Gemini
    deepseek.ts       # wrapper (openai-compatible, base_url override)
  core/
    tracker.ts        # lógica central de acumulação de custos
    pricing.ts        # resolução de preço: remoto → bundle → custom
    storage.ts        # memória + SQLite opcional
    sync.ts           # fetch de prices.json remoto com cache local
  types/
    index.ts
  index.ts            # exports públicos

prices.json           # preços bundlados (atualizado pelo GitHub Action)
.github/
  workflows/
    sync-prices.yml   # roda toda segunda, atualiza prices.json via scraping

## Resolução de preços (em ordem)
1. customPrices passado pelo usuário na config
2. prices.json remoto do GitHub (cache 24h em ~/.llm-cost-tracker/prices.json)
3. prices.json bundlado na lib (sempre presente como fallback)
Se modelo não encontrado em nenhuma camada: custo = 0 + warning no console

## Interface pública

### Setup
```ts
import { createTracker } from 'llm-cost-tracker'

const tracker = createTracker({
  // Todos os campos opcionais
  storage: 'memory',           // 'memory' | 'sqlite'
  alertThreshold: 1.00,        // USD — dispara webhookUrl se ultrapassar
  webhookUrl: 'https://...',   // Discord/Slack webhook
  syncPrices: true,            // buscar preços remotos (default: true)
  customPrices: {              // override de preços por modelo
    'meu-modelo': { input: 0.001, output: 0.002 }
  }
})
```

### Wrapper OpenAI (também funciona para DeepSeek com base_url)
```ts
import OpenAI from 'openai'
import { wrapOpenAI } from 'llm-cost-tracker'

const openai = wrapOpenAI(new OpenAI(), tracker)

const res = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [...],
  // campos extras opcionais — removidos antes de enviar à API
  __sessionId: 'session_abc',
  __userId: 'user_123'
})
// res é idêntico ao da OpenAI — zero diferença
```

### Wrapper Anthropic
```ts
import Anthropic from '@anthropic-ai/sdk'
import { wrapAnthropic } from 'llm-cost-tracker'

const anthropic = wrapAnthropic(new Anthropic(), tracker)

const res = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: [...],
  __sessionId: 'session_abc',
  __userId: 'user_123'
})
```

### Wrapper Gemini
```ts
import { GoogleGenerativeAI } from '@google/generative-ai'
import { wrapGemini } from 'llm-cost-tracker'

const genAI = wrapGemini(new GoogleGenerativeAI(apiKey), tracker)
```

### Relatório
```ts
tracker.getReport()
// Retorna:
{
  totalCostUSD: 0.087,
  totalTokens: { input: 24000, output: 6000 },
  byModel: {
    'gpt-4o': { costUSD: 0.062, calls: 5, tokens: { input: 20000, output: 5000 } },
    'claude-sonnet-4-6': { costUSD: 0.025, calls: 2, tokens: { input: 4000, output: 1000 } }
  },
  bySession: {
    'session_abc': { costUSD: 0.045, calls: 4 }
  },
  byUser: {
    'user_123': { costUSD: 0.087, calls: 7 }
  },
  period: { from: '2026-04-16T10:00:00Z', to: '2026-04-16T11:00:00Z' }
}

tracker.reset()                        // limpa tudo
tracker.resetSession('session_abc')    // limpa sessão específica
tracker.exportJSON()                   // retorna JSON string
tracker.exportCSV()                    // retorna CSV string
```

### CLI (opcional, instalado junto)
```bash
llm-cost-tracker sync          # força atualização dos preços remotos
llm-cost-tracker prices        # lista todos os modelos e preços atuais
llm-cost-tracker report        # mostra último relatório salvo (SQLite)
```

## Comportamento dos wrappers
- Campos __sessionId e __userId são extraídos e removidos ANTES de enviar à API
- A resposta retornada ao usuário é IDÊNTICA à da API original — mesmo tipo, mesma shape
- Leitura de usage.prompt_tokens / usage.input_tokens + usage.completion_tokens / usage.output_tokens
- Suporte a streaming: acumula tokens do usage chunk final quando disponível
- Todas operações de tracking são síncronas e não bloqueantes (não adicionam latência)
- Se a chamada à API falhar, o tracker não registra custo e não interfere no erro original

## prices.json — formato
```json
{
  "updated_at": "2026-04-16",
  "source": "https://raw.githubusercontent.com/user/llm-cost-tracker/main/prices.json",
  "models": {
    "gpt-4o":            { "input": 2.50,  "output": 10.00 },
    "gpt-4o-mini":       { "input": 0.15,  "output": 0.60  },
    "gpt-5":             { "input": 1.25,  "output": 10.00 },
    "gpt-5-mini":        { "input": 0.25,  "output": 2.00  },
    "gpt-5-nano":        { "input": 0.05,  "output": 0.40  },
    "claude-opus-4-6":   { "input": 5.00,  "output": 25.00 },
    "claude-sonnet-4-6": { "input": 3.00,  "output": 15.00 },
    "claude-haiku-4-5":  { "input": 1.00,  "output": 5.00  },
    "gemini-2.5-pro":    { "input": 1.25,  "output": 10.00 },
    "gemini-2.5-flash":  { "input": 0.30,  "output": 2.50  },
    "deepseek-chat":     { "input": 0.28,  "output": 0.42  },
    "deepseek-reasoner": { "input": 0.55,  "output": 2.19  }
  }
}
```

## GitHub Action — sync-prices.yml
- Trigger: schedule (toda segunda 06:00 UTC) + workflow_dispatch manual
- Steps:
  1. Checkout do repo
  2. Node 20 + instala playwright
  3. Scraping das páginas de pricing (openai.com/api/pricing, platform.claude.com/docs/en/about-claude/pricing, ai.google.dev/pricing)
  4. Gera novo prices.json
  5. Se houver diff: commit "chore: sync prices YYYY-MM-DD" + npm version patch + push + npm publish

## Extras obrigatórios
- README com exemplos de setup para cada provider
- llm.txt na raiz para uso com Claude/Cursor
- Testes unitários (vitest): tracker, pricing resolver, wrappers mockados
- TypeScript strict mode
- Export de tipos públicos bem documentados
- Nome sugerido: llm-cost-tracker no npm