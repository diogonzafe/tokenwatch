# TokenWatch Cloud — Plano SaaS

> **Premissa:** "Você já sabe quanto custa seu servidor. Por que não sabe quanto custa sua IA?"

Todo dev que coloca LLM em produção tem o mesmo problema: no fim do mês chega a fatura da OpenAI/Anthropic e é um número opaco. Você não sabe qual feature gastou mais, qual cliente consumiu mais, qual prompt ficou caro demais. O TokenWatch resolve isso com uma linha de código.

---

## Estado Atual da Lib (v0.6.0)

A lib está essencialmente feature-complete para suportar o SaaS. O que já existe:

| Funcionalidade | Status |
|---|---|
| Interceptação OpenAI / Anthropic / Gemini / DeepSeek | ✅ |
| Rastreio por `model`, `sessionId`, `userId`, `feature` | ✅ |
| Cache tokens + reasoning tokens (custo real) | ✅ |
| Storage: memory, SQLite, PostgreSQL, MySQL, MongoDB | ✅ |
| `tracker.getReport()` com filtro por período | ✅ |
| `tracker.getCostForecast()` | ✅ |
| `tracker.exportCSV()` e `tracker.exportJSON()` | ✅ |
| Budget alerts por user/session via webhook | ✅ |
| Anomaly detection via webhook | ✅ |
| LangChain callback handler | ✅ |
| OpenTelemetry exporter (`IExporter` interface) | ✅ |
| Dashboard local (`tokenwatch dashboard`, dark theme, SSE, Chart.js) | ✅ |
| CLI: `sync`, `prices`, `report`, `dashboard` | ✅ |
| Lazy tracker / singleton pattern | ✅ |
| Cheaper model suggestions | ✅ |

**A única mudança necessária na lib para suportar o cloud é adicionar `cloudApiKey` ao `TrackerConfig`**, que internamente instancia um `CloudExporter` (usando a `IExporter` interface já existente — mesmo padrão do `OTelExporter`).

---

## 1. O Produto

TokenWatch é uma plataforma de **observabilidade financeira para LLM**. Composta por duas partes:

- **`@diogonzafe/tokenwatch`** — lib npm open-source, gratuita, que intercepta chamadas LLM e rastreia custo por sessão, usuário, modelo e feature
- **TokenWatch Cloud** — SaaS pago em `tokenwatch.dev` com dashboard web, alertas, histórico persistido e suporte a times

A lib é o canal de distribuição. O Cloud é a monetização.

---

## 2. Diferencial

| Fatura OpenAI | TokenWatch |
|---|---|
| Custo total do mês | Custo por feature/endpoint |
| Por modelo | Por cliente/tenant |
| Nada mais | Por sessão de conversa |
| Você descobre no fim do mês | Alerta em tempo real |
| Sem contexto do seu código | Rastreado com seus próprios IDs |

---

## 3. Dois Caminhos de Entrada

```
CAMINHO A (dev técnico)          CAMINHO B (direto no cloud)

npm install @diogonzafe/tokenwatch  acessa tokenwatch.dev
        ↓                                  ↓
usa local primeiro               cria conta + workspace
(dashboard CLI, SQLite)                    ↓
        ↓                           cria projeto + API Key
gosta, quer mais                           ↓
        ↓                        cola a key na lib direto
cria conta no site                         ↓
        ↓                                  ↓
        └──────────→ mesmo dashboard ←─────┘
```

O dashboard local (`tokenwatch dashboard`) já existe e funciona — é o que converte o dev do caminho A. Com `cloudApiKey`, os eventos espelham para o cloud automaticamente.

---

## 4. Como Funciona (Técnico)

### Integração — uma linha

```typescript
// antes (já funciona, local)
const tracker = createTracker({ storage: 'sqlite' })
const openai = wrapOpenAI(new OpenAI({ apiKey: "..." }), tracker)

// depois (espelha para o cloud também)
const tracker = createTracker({
  storage: 'sqlite',                          // continua guardando local
  cloudApiKey: "tw_live_proj_abc123",         // + espelha para o cloud
})
const openai = wrapOpenAI(new OpenAI({ apiKey: "..." }), tracker)
```

Internamente `cloudApiKey` instancia um `CloudExporter implements IExporter` que faz POST fire-and-forget para a API de ingestão. O storage local continua funcionando independentemente.

### Fluxo de dados

```
lib (cliente)
  ↓  track() → storage local (SQLite/Postgres/memory)
  ↓  CloudExporter.export() → POST /v1/ingest (fire-and-forget)

api.tokenwatch.dev/v1/ingest
  ↓  valida API Key (Redis cache 5min)
  ↓  BullMQ Queue

Ingest Worker
  ↓  PostgreSQL (usage_events)
  ↓  incrementa workspace.events_used_month
```

Falha no cloud nunca quebra a aplicação do cliente. O lib loga `warn` e segue.

### Payload de ingestão

Todos os campos que a lib já rastreia são enviados:

```json
{
  "model": "gpt-4o",
  "inputTokens": 1200,
  "outputTokens": 340,
  "reasoningTokens": 0,
  "cachedTokens": 200,
  "cacheCreationTokens": 0,
  "costUSD": 0.0064,
  "sessionId": "session_abc",
  "userId": "user_123",
  "feature": "summarizer",
  "timestamp": "2026-04-17T14:23:00Z"
}
```

A API Key vai no header `Authorization: Bearer tw_live_proj_abc123`, não no body.

Nunca sobe prompt, resposta ou dados sensíveis — só métricas.

---

## 5. Site — tokenwatch.dev

### Páginas públicas

| Página | Conteúdo |
|---|---|
| `/` | Landing — proposta de valor, demo animado, pricing, CTA |
| `/pricing` | Tabela de planos detalhada |
| `/docs` | Documentação da lib + guia de integração cloud |
| `/blog` | Conteúdo SEO — "how to track OpenAI costs" etc |
| `/changelog` | Novidades do produto |

### Páginas autenticadas

| Página | Conteúdo |
|---|---|
| `/dashboard` | Visão geral do workspace — custo total, projetos, alertas recentes |
| `/projects` | Lista de projetos |
| `/projects/[id]` | Dashboard do projeto — gráficos (custo/tempo, por modelo, por user, por feature), breakdown, forecast |
| `/projects/[id]/settings` | API Keys, nome, limites, ambiente prod/test |
| `/team` | Membros do workspace (Team+) |
| `/alerts` | Configuração de alertas (threshold + anomalia) |
| `/billing` | Plano atual, uso do mês, upgrade/downgrade |
| `/settings` | Conta, workspace, OAuth connections |

O dashboard do projeto espelha visualmente o `tokenwatch dashboard` local (mesmos dados, mesma estrutura), mas com histórico persistido, multi-projeto e acesso via browser sem CLI.

---

## 6. Fluxo de Onboarding

```
1. Acessa tokenwatch.dev
         ↓
2. Clica "Get Started Free"
         ↓
3. OAuth com GitHub ou Google (sem formulário)
         ↓
4. Workspace criado automaticamente
         ↓
5. "Crie seu primeiro projeto" → nome → criar
         ↓
6. API Key gerada, código pronto para copiar:
   createTracker({ cloudApiKey: "tw_live_proj_..." })
         ↓
7. Tela aguarda primeiro evento (polling 3s)
         ↓
8. Primeiro evento chega → confete 🎉
         ↓
9. Redireciona para dashboard do projeto
```

Onboarding termina quando o primeiro evento chega — não quando o usuário clica em "concluir".

---

## 7. Regras de Negócio

### Workspace
- Criado automaticamente no signup
- Billing é por workspace, não por usuário
- Owner é o único que pode deletar o workspace
- Um usuário pode pertencer a múltiplos workspaces

### Projetos
- Limite de projetos por plano: 1 / 5 / ilimitado
- Projeto deletado: soft delete por 30 dias
- Cada projeto tem suas próprias API Keys (prod/staging separados)

### API Keys
- Formato: `tw_live_proj_[32 chars]` (produção) / `tw_test_proj_[32 chars]` (test — não conta no limite de eventos)
- Exibida completa apenas uma vez na criação
- Pode revogar e gerar nova a qualquer momento
- Uma key = um projeto

### Eventos / Ingestão
- Endpoint: `POST api.tokenwatch.dev/v1/ingest`
- Auth: `Authorization: Bearer <apiKey>`
- Fire-and-forget: falha no cloud nunca quebra a aplicação do cliente
- Redis cache de 5min para validação de API Keys (evita hit no banco por request)
- Ao estourar limite do plano: retorna 429, lib loga `warn` silenciosamente

### Limites e Reset
- Contador de eventos reseta dia 1 de cada mês às 00:00 UTC
- Email em 80% e 100% do limite
- Ao atingir 100%: eventos rejeitados + banner no dashboard

### Histórico e Retenção
- Hobby: 7 dias
- Pro: 12 meses
- Team: indefinido
- Downgrade: dados além do novo limite ficam read-only por 30 dias, depois deletados com aviso por email

### Alertas (cloud)
- Tipos: threshold mensal de custo e anomalia (custo 3x acima da média — mesmo algoritmo já na lib)
- Canais: email, Slack webhook, Discord webhook
- Cooldown de 1h entre alertas do mesmo tipo/projeto
- Disponível a partir do Pro

### Membros (Team)
- Roles: Owner / Admin / Viewer
- Convite por email, expira em 48h
- Remoção: acesso revogado imediatamente

---

## 8. Planos

| | Hobby | Pro | Team |
|---|---|---|---|
| **Preço** | Grátis | $19/mês | $49/mês |
| **Projetos** | 1 | 5 | Ilimitado |
| **API Keys por projeto** | 1 | 3 | 10 |
| **Eventos/mês** | 100k | 5M | Ilimitado |
| **Histórico** | 7 dias | 12 meses | Ilimitado |
| **Membros** | 1 | 1 | 10 |
| **Alertas cloud** | ✗ | ✅ | ✅ |
| **Export CSV** | ✗ | ✅ | ✅ |
| **Ambientes test/prod** | ✗ | ✅ | ✅ |
| **API de relatórios** | ✗ | ✗ | ✅ |
| **Dashboard local (CLI)** | ✅ grátis | ✅ | ✅ |

> O dashboard local (`tokenwatch dashboard`) é sempre gratuito — é o que traz o dev para dentro. O Cloud é o upgrade natural.

**Upgrade:** efeito imediato, cobra proporcional no Stripe
**Downgrade:** efeito no próximo ciclo
**Cancelamento:** plano ativo até fim do período, depois vira Hobby automaticamente

---

## 9. Perfis de Usuário

**Dev solo / side project → Hobby (grátis)**
- Começou com o dashboard local (CLI)
- Quer histórico além de 7 dias e acesso fora da máquina
- Valor para o produto: distribuição e boca a boca

**Dev com produto em produção → Pro ($19/mês)**
- Quer histórico persistido e alertas cloud
- Dor real: "meu agente ficou em loop e gastei $40 sem perceber"
- Quer mostrar gráfico de custo para sócio/investidor sem ter que abrir terminal

**Agência que vende agentes → Team ($49/mês)**
- Tem 5-10 clientes usando agentes diferentes
- Precisa saber custo por cliente (byUser) para precificar o serviço
- Quer exportar relatório CSV para cobrar o cliente pelo uso real
- Dor real: "vendo agente por R$2k/mês mas não sei se tenho margem"

---

## 10. Schema do Banco (Cloud)

```sql
-- Identidade
users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  provider TEXT,           -- 'github' | 'google'
  provider_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
)

workspaces (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID REFERENCES users(id),
  plan TEXT NOT NULL DEFAULT 'hobby',  -- 'hobby' | 'pro' | 'team'
  events_used_month BIGINT DEFAULT 0,
  billing_cycle_start TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
)

workspace_members (
  workspace_id UUID REFERENCES workspaces(id),
  user_id UUID REFERENCES users(id),
  role TEXT NOT NULL,      -- 'owner' | 'admin' | 'viewer'
  invited_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  PRIMARY KEY (workspace_id, user_id)
)

invites (
  id UUID PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ
)

-- Projetos e keys
projects (
  id UUID PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ    -- soft delete
)

api_keys (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  name TEXT,
  key_hash TEXT UNIQUE NOT NULL,   -- SHA-256 da key completa
  key_preview TEXT NOT NULL,       -- últimos 8 chars (exibição)
  environment TEXT DEFAULT 'production',  -- 'production' | 'test'
  created_at TIMESTAMPTZ DEFAULT now(),
  revoked_at TIMESTAMPTZ
)

-- Dados de uso (particionado por mês)
usage_events (
  id BIGSERIAL,
  project_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  model TEXT NOT NULL,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  reasoning_tokens INT NOT NULL DEFAULT 0,
  cached_tokens INT NOT NULL DEFAULT 0,
  cache_creation_tokens INT NOT NULL DEFAULT 0,
  cost_usd NUMERIC(18,8) NOT NULL,
  session_id TEXT,
  user_id TEXT,
  feature TEXT,
  timestamp TIMESTAMPTZ NOT NULL
) PARTITION BY RANGE (timestamp);
-- índices: (project_id, timestamp), (workspace_id, timestamp), (user_id), (model)

-- Alertas
alert_configs (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  type TEXT NOT NULL,          -- 'threshold' | 'anomaly'
  threshold NUMERIC,           -- USD (threshold) ou multiplicador (anomaly)
  channel TEXT NOT NULL,       -- 'email' | 'slack' | 'discord'
  webhook_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
)

alert_logs (
  id UUID PRIMARY KEY,
  alert_config_id UUID REFERENCES alert_configs(id),
  triggered_at TIMESTAMPTZ DEFAULT now(),
  value_at_trigger NUMERIC
)

-- Billing
billing_events (
  id UUID PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id),
  type TEXT NOT NULL,
  stripe_event_id TEXT UNIQUE,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
)
```

---

## 11. Stack Técnico

```
Frontend (tokenwatch.dev)
  Next.js 15 + Tailwind + Recharts
  Deploy: Vercel

Backend API (api.tokenwatch.dev)
  Fastify (Node.js, TypeScript)
  BullMQ → fila de ingestão de eventos
  Redis (Upstash) → cache de API Keys
  PostgreSQL (Supabase) → persistência
  Deploy: Fly.io ou Railway (Fastify não corre bem no Vercel Functions)

Auth
  Supabase Auth — GitHub + Google OAuth
  JWT passado pelo frontend para a API

Billing
  Stripe Checkout + Webhooks + Customer Portal

Workers / Jobs
  Trigger.dev:
    - ingest-worker    → consome BullMQ, insere usage_events
    - alert-worker     → verifica thresholds e anomalias, dispara emails/webhooks
    - retention-job    → deleta eventos além do limite do plano (cron diário)
    - reset-job        → zera events_used_month (cron dia 1 de cada mês)

Email
  Resend → transacional (invites, billing) + alertas

Monitoramento
  Próprio TokenWatch rastreando o próprio backend 🙂
```

---

## 12. Mudança na Lib para Suportar o Cloud

É a única alteração necessária na lib. O padrão já existe (`OTelExporter`).

**`src/types/index.ts`** — adicionar ao `TrackerConfig`:
```ts
cloudApiKey?: string   // 'tw_live_proj_...' ou 'tw_test_proj_...'
cloudEndpoint?: string // override para self-hosted (default: 'https://api.tokenwatch.dev/v1/ingest')
```

**`src/exporters/cloud.ts`** — novo exporter (mesmo padrão do `otel.ts`):
```ts
export class CloudExporter implements IExporter {
  constructor(private readonly apiKey: string, private readonly endpoint: string) {}

  export(entry: UsageEntry): void {
    fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: entry.model,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        reasoningTokens: entry.reasoningTokens ?? 0,
        cachedTokens: entry.cachedTokens ?? 0,
        cacheCreationTokens: entry.cacheCreationTokens ?? 0,
        costUSD: entry.costUSD,
        sessionId: entry.sessionId,
        userId: entry.userId,
        feature: entry.feature,
        timestamp: entry.timestamp,
      }),
    }).catch(() => { /* fire-and-forget */ })
  }
}
```

**`src/core/tracker.ts`** — no `createTracker()`:
```ts
if (cloudApiKey) {
  // CloudExporter é adicionado internamente, sem expor ao utilizador
  const { CloudExporter } = await import('../exporters/cloud.js')
  internalExporter = new CloudExporter(cloudApiKey, cloudEndpoint ?? DEFAULT_ENDPOINT)
}
```

Sem breaking changes. Lib continua 100% funcional sem `cloudApiKey`.

---

## 13. Roadmap de Desenvolvimento

### Fase 0 — Lib (já feita ✅)
```
✅ Dashboard local (tokenwatch dashboard)
✅ Todas as features de rastreio
✅ IExporter interface (padrão para CloudExporter)
✅ exportCSV() / exportJSON()
✅ Anomaly detection + budget alerts
```

### Fase 1 — Cloud Foundation (semanas 1-3)
```
Semana 1  → lib: cloudApiKey + CloudExporter (fire-and-forget POST)
Semana 2  → API: POST /v1/ingest + validação de API Key + Redis cache
            → Postgres: schema + particionamento por mês
Semana 3  → Worker: BullMQ consumer, insere eventos, incrementa contador
            → Testes de carga (100k eventos/min)
```

### Fase 2 — Auth + Projetos (semanas 4-5)
```
Semana 4  → Supabase Auth: OAuth GitHub + Google
            → workspace auto-criado no signup
            → CRUD: workspace, projeto, API Key (gerar, revogar, preview)
Semana 5  → Middleware: JWT → workspace_id + plano + limites
            → Lógica de limites: rejeitar 429 ao estourar quota
            → Emails: Resend (welcome, convite de membro)
```

### Fase 3 — Dashboard Web (semanas 6-7)
```
Semana 6  → /projects/[id]: gráfico custo/tempo, tabs 1h|24h|7d|30d|All
            → Breakdown: por modelo, por user, por feature (espelho do dashboard local)
            → Cards: custo total, tokens, calls, burn rate, forecast
Semana 7  → /dashboard: visão multi-projeto
            → Onboarding: tela "aguardando primeiro evento" + polling
            → Export CSV (Pro+)
```

### Fase 4 — Billing + Alertas (semanas 8-9)
```
Semana 8  → Stripe: Checkout, Customer Portal, webhooks (subscription created/updated/deleted)
            → /billing: plano atual, uso do mês, upgrade CTA
            → Downgrade: dados read-only, email de aviso
Semana 9  → Alertas cloud: threshold mensal + anomalia diária
            → Canais: email (Resend) + Slack/Discord webhook
            → /alerts: UI de configuração
            → Alert worker: cron, cooldown 1h
```

### Fase 5 — Polish + Beta (semanas 10-12)
```
Semana 10 → Team: convite por email, roles Owner/Admin/Viewer, /team UI
            → API de relatórios (Team+): GET /v1/report?since=&until=
Semana 11 → Landing page: copywriting, demo animado, pricing, CTA
            → /docs: guia de integração cloud (adicionado ao README existente)
            → /changelog
Semana 12 → Testes end-to-end, fix de edge cases
            → Beta público
```

---

## 14. Infraestrutura e Custos

| Serviço | Para quê | Custo inicial |
|---|---|---|
| Vercel | Frontend Next.js | Grátis → $20/mês |
| Supabase | Postgres + Auth | Grátis → $25/mês |
| Upstash | Redis (API Key cache) | Grátis → $10/mês |
| Fly.io / Railway | API Fastify | Grátis → $10/mês |
| Trigger.dev | Workers + jobs | Grátis → $5/mês |
| Resend | Email transacional | Grátis → $20/mês |
| Stripe | Billing | Grátis até receber |
| Domínio tokenwatch.dev | — | ~$18/ano |

| Fase | Usuários | Infra/mês |
|---|---|---|
| Desenvolvimento | 0 | **$0** |
| Beta (0-50 users) | 0-50 | **~$22** |
| Crescimento (50-200) | 50-200 | **~$80** |
| Escala (200+) | 200+ | **~$270** |

---

## 15. Estimativa de Receita

### Funil realista
```
Downloads da lib por mês
  ↓ 5% criam conta cloud
Usuários cloud ativos
  ↓ 8% convertem para pago
Clientes pagantes
```

### Cenário Conservador (mês 6-12)
```
Downloads/mês:      2.000
Usuários ativos:      100
Clientes pagantes:      8

  6 × Pro  ($19) = $114
  2 × Team ($49) =  $98
─────────────────────────
MRR                = $212
Infra               -  $25
─────────────────────────
Lucro líquido      = $187/mês
```

### Cenário Moderado (mês 12-18)
```
Downloads/mês:      8.000
Usuários ativos:      400
Clientes pagantes:     32

  20 × Pro  ($19) = $380
  10 × Team ($49) = $490
   2 × Enterprise = $300
──────────────────────────
MRR                = $1.170
Infra               -   $80
──────────────────────────
Lucro líquido      = $1.090/mês
```

### Cenário Otimista (mês 18-24)
```
Downloads/mês:     25.000
Usuários ativos:    1.250
Clientes pagantes:    100

  55 × Pro  ($19) = $1.045
  35 × Team ($49) = $1.715
  10 × Enterprise = $2.000
───────────────────────────
MRR                = $4.760
Infra               -  $270
───────────────────────────
Lucro líquido      = $4.490/mês
```

### Projeção mês a mês (moderado)
```
Mês 1-3  → $0          construindo
Mês 4    → $50-100     beta, primeiros free users
Mês 5    → $150-200    primeiros pagantes
Mês 6    → $300-400    boca a boca começa
Mês 9    → $600-800    SEO começa a trazer tráfego
Mês 12   → $1.000-1.500
Mês 18   → $2.500-4.000
Mês 24   → $4.000-8.000
```

### Valuation se quiser vender
SaaS B2D (developer tools) é avaliado tipicamente em 4x-6x ARR:
```
MRR $1.000 → ARR $12k  → vale $48k-72k
MRR $3.000 → ARR $36k  → vale $144k-216k
MRR $5.000 → ARR $60k  → vale $240k-360k
```

---

## 16. Por que Observabilidade tem Churn Baixo

- A lib está no código — remover dá trabalho
- O dev depende dos dados para tomar decisão
- Quanto mais tempo usa, mais histórico tem a perder
- O custo ($19-49/mês) é pequeno comparado com o que a lib ajuda a economizar

**Meta: churn abaixo de 3% ao mês.**

---

## 17. Alavancas de Crescimento

| Ação | Impacto estimado |
|---|---|
| Post no dev.to / Hacker News sobre a lib | +500-2.000 downloads |
| README bem feito com badge de npm downloads | +20% conversão lib → cloud |
| Onboarding com tempo para primeiro evento < 2 min | +15% retenção |
| "Powered by TokenWatch" badge opcional nos relatórios | crescimento orgânico |
| Thread mostrando custo real de agente em produção | viral potencial |

---

## 18. Métricas que Indicam Sucesso

| Métrica | Meta |
|---|---|
| % signups que chegam ao primeiro evento | > 60% |
| Retenção D7 (ainda tem eventos no dia 7) | > 40% |
| Conversão Hobby → Pro em 30 dias | > 8% |
| Churn mensal Pro | < 5% |
| Tempo médio até primeiro evento (onboarding) | < 3 min |

---

## 19. Ponto de Equilíbrio

```
Infra $22/mês  →  2 clientes Pro ($38)     ✅ coberto
Infra $80/mês  →  5 clientes Pro ($95)     ✅ coberto
Infra $270/mês → 15 clientes Pro ($285)    ✅ coberto
```

---

## 20. Resumo Executivo

**O que é:** SaaS de observabilidade financeira para LLM com distribuição via npm open-source.

**Para quem:** Devs e agências que usam LLM em produção e precisam saber exatamente quanto cada parte do sistema custa.

**Vantagem competitiva actual:** A lib v0.6.0 está feature-complete — rastreio multi-provider, storage flexível, dashboard local, anomaly detection, OTel exporter, LangChain integration. O canal de distribuição (npm) e o produto de entrada (dashboard local gratuito) já existem. O SaaS é a camada de persistência, colaboração e monetização por cima de uma base técnica sólida.

**Única mudança na lib:** adicionar `cloudApiKey` ao `TrackerConfig` — uma tarde de trabalho, zero breaking changes.

**Investimento inicial:** ~$18 (domínio). Todo o resto é free tier até ter receita.

**Potencial:** $4.000-8.000/mês em 24 meses no cenário otimista. Vendável por $150k-300k ao atingir $3-5k MRR consistente.

**Em uma frase:** TokenWatch é o New Relic para gastos com LLM — você instrumenta uma vez e nunca mais fica cego sobre o que sua IA está custando.
