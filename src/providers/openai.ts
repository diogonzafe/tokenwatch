import type { Tracker, TrackingMeta } from '../types/index.js'

// ─── Minimal structural types (no hard dep on openai package) ────────────────

interface CompletionTokenDetails {
  reasoning_tokens?: number
}

interface Usage {
  prompt_tokens?: number
  completion_tokens?: number
  input_tokens?: number
  output_tokens?: number
  completion_tokens_details?: CompletionTokenDetails | null
}

interface Completion {
  model?: string
  usage?: Usage | null
}

interface StreamChunk {
  model?: string
  usage?: Usage | null
}

interface CompletionsLike {
  create(params: Record<string, unknown>): Promise<unknown>
}

interface ChatLike {
  completions: CompletionsLike
}

interface EmbeddingUsage {
  prompt_tokens?: number
  total_tokens?: number
}

interface EmbeddingResponse {
  model?: string
  usage?: EmbeddingUsage | null
}

interface EmbeddingsLike {
  create(params: Record<string, unknown>): Promise<unknown>
}

type OpenAILike = { chat: ChatLike; embeddings?: EmbeddingsLike } & Record<string, unknown>

// ─── Augmented return type ────────────────────────────────────────────────────

type AugmentedCreate<TCreate extends (...args: any[]) => any> = (
  params: Parameters<TCreate>[0] & TrackingMeta,
) => ReturnType<TCreate>

type WrappedOpenAI<T extends OpenAILike> = Omit<T, 'chat' | 'embeddings'> & {
  chat: Omit<T['chat'], 'completions'> & {
    completions: Omit<T['chat']['completions'], 'create'> & {
      create: AugmentedCreate<T['chat']['completions']['create']>
    }
  }
  embeddings: T['embeddings'] extends EmbeddingsLike
    ? Omit<T['embeddings'], 'create'> & {
        create: AugmentedCreate<T['embeddings']['create']>
      }
    : T['embeddings']
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractMeta(params: Record<string, unknown>): {
  cleaned: Record<string, unknown>
  sessionId: string | undefined
  userId: string | undefined
  feature: string | undefined
} {
  const { __sessionId, __userId, __feature, ...cleaned } = params as Record<string, unknown> & TrackingMeta
  return {
    cleaned,
    sessionId: typeof __sessionId === 'string' ? __sessionId : undefined,
    userId: typeof __userId === 'string' ? __userId : undefined,
    feature: typeof __feature === 'string' ? __feature : undefined,
  }
}

function extractUsage(usage: Usage | null | undefined): {
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
} {
  if (!usage) return { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 }
  return {
    inputTokens: usage.prompt_tokens ?? usage.input_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? usage.output_tokens ?? 0,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
  }
}

function trackWithMeta(
  tracker: Tracker,
  model: string,
  inputTokens: number,
  outputTokens: number,
  reasoningTokens: number,
  sessionId: string | undefined,
  userId: string | undefined,
  feature: string | undefined,
): void {
  // OpenAI bills reasoning_tokens at output price, separately from completion_tokens.
  // We fold them into outputTokens so the cost is correct, and also store them in
  // reasoningTokens so report.byModel[x].tokens.reasoning shows the breakdown.
  tracker.track({
    model,
    inputTokens,
    outputTokens: outputTokens + reasoningTokens,
    ...(reasoningTokens > 0 && { reasoningTokens }),
    ...(sessionId !== undefined && { sessionId }),
    ...(userId !== undefined && { userId }),
    ...(feature !== undefined && { feature }),
  })
}

// ─── Streaming wrapper ────────────────────────────────────────────────────────

async function* wrapStream(
  stream: AsyncIterable<StreamChunk>,
  model: string,
  sessionId: string | undefined,
  userId: string | undefined,
  feature: string | undefined,
  tracker: Tracker,
): AsyncGenerator<StreamChunk> {
  let lastChunk: StreamChunk | undefined
  for await (const chunk of stream) {
    lastChunk = chunk
    yield chunk
  }
  const { inputTokens, outputTokens, reasoningTokens } = extractUsage(lastChunk?.usage)
  if (!lastChunk?.usage) {
    console.warn(
      `[tokenwatch] No usage data in stream for model "${model}". Cost recorded as $0. ` +
        `Pass stream_options: { include_usage: true } to get accurate costs.`,
    )
  }
  trackWithMeta(tracker, model, inputTokens, outputTokens, reasoningTokens, sessionId, userId, feature)
}

// ─── Public wrapper ───────────────────────────────────────────────────────────

/**
 * Wraps an OpenAI client (or any OpenAI-compatible client) to transparently
 * intercept chat.completions.create and embeddings.create calls and report
 * token usage to the tracker.
 *
 * The returned client is typed to accept __sessionId, __userId, and __feature
 * alongside the normal params — no type cast required at the call site.
 */
export function wrapOpenAI<T extends OpenAILike>(client: T, tracker: Tracker): WrappedOpenAI<T> {
  const proxiedCompletions = new Proxy(client.chat.completions, {
    get(target, prop) {
      if (prop !== 'create')
        return (target as unknown as Record<string | symbol, unknown>)[prop]

      return async function (params: Record<string, unknown>) {
        const { cleaned, sessionId, userId, feature } = extractMeta(params)
        const model = typeof cleaned['model'] === 'string' ? cleaned['model'] : 'unknown'

        const result = await (target as CompletionsLike).create(cleaned)

        if (result && typeof result === 'object' && Symbol.asyncIterator in result) {
          return wrapStream(
            result as AsyncIterable<StreamChunk>,
            model,
            sessionId,
            userId,
            feature,
            tracker,
          )
        }

        const completion = result as Completion
        const { inputTokens, outputTokens, reasoningTokens } = extractUsage(completion.usage)
        trackWithMeta(
          tracker,
          completion.model ?? model,
          inputTokens,
          outputTokens,
          reasoningTokens,
          sessionId,
          userId,
          feature,
        )

        return result
      }
    },
  })

  const proxiedChat = new Proxy(client.chat, {
    get(target, prop) {
      if (prop === 'completions') return proxiedCompletions
      return (target as unknown as Record<string | symbol, unknown>)[prop]
    },
  })

  // Only proxy embeddings if the client exposes them
  const proxiedEmbeddings = client.embeddings
    ? new Proxy(client.embeddings, {
        get(target, prop) {
          if (prop !== 'create')
            return (target as unknown as Record<string | symbol, unknown>)[prop]

          return async function (params: Record<string, unknown>) {
            const { cleaned, sessionId, userId, feature } = extractMeta(params)
            const model = typeof cleaned['model'] === 'string' ? cleaned['model'] : 'unknown'

            const result = await (target as EmbeddingsLike).create(cleaned)

            const embedding = result as EmbeddingResponse
            const inputTokens = embedding.usage?.total_tokens ?? 0
            // Embeddings have no output tokens or reasoning tokens
            trackWithMeta(tracker, embedding.model ?? model, inputTokens, 0, 0, sessionId, userId, feature)

            return result
          }
        },
      })
    : undefined

  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'chat') return proxiedChat
      if (prop === 'embeddings') return proxiedEmbeddings
      return (target as unknown as Record<string | symbol, unknown>)[prop]
    },
  }) as unknown as WrappedOpenAI<T>
}
