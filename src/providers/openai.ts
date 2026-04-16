import type { Tracker, TrackingMeta } from '../types/index.js'

// ─── Minimal structural types (no hard dep on openai package) ────────────────

interface Usage {
  prompt_tokens?: number
  completion_tokens?: number
  input_tokens?: number
  output_tokens?: number
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

type OpenAILike = { chat: ChatLike } & Record<string, unknown>

// ─── Augmented return type ────────────────────────────────────────────────────
// The wrapped client's create() accepts TrackingMeta fields (__sessionId, __userId)
// in addition to the original params — no `as any` needed at the call site.

type AugmentedCreate<TCreate extends (...args: any[]) => any> = (
  params: Parameters<TCreate>[0] & TrackingMeta,
) => ReturnType<TCreate>

type WrappedOpenAI<T extends OpenAILike> = Omit<T, 'chat'> & {
  chat: Omit<T['chat'], 'completions'> & {
    completions: Omit<T['chat']['completions'], 'create'> & {
      create: AugmentedCreate<T['chat']['completions']['create']>
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractMeta(params: Record<string, unknown>): {
  cleaned: Record<string, unknown>
  sessionId: string | undefined
  userId: string | undefined
} {
  const { __sessionId, __userId, ...cleaned } = params as Record<string, unknown> & TrackingMeta
  return {
    cleaned,
    sessionId: typeof __sessionId === 'string' ? __sessionId : undefined,
    userId: typeof __userId === 'string' ? __userId : undefined,
  }
}

function extractUsage(usage: Usage | null | undefined): {
  inputTokens: number
  outputTokens: number
} {
  if (!usage) return { inputTokens: 0, outputTokens: 0 }
  return {
    inputTokens: usage.prompt_tokens ?? usage.input_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? usage.output_tokens ?? 0,
  }
}

function trackWithMeta(
  tracker: Tracker,
  model: string,
  inputTokens: number,
  outputTokens: number,
  sessionId: string | undefined,
  userId: string | undefined,
): void {
  tracker.track({
    model,
    inputTokens,
    outputTokens,
    ...(sessionId !== undefined && { sessionId }),
    ...(userId !== undefined && { userId }),
  })
}

// ─── Streaming wrapper ────────────────────────────────────────────────────────

async function* wrapStream(
  stream: AsyncIterable<StreamChunk>,
  model: string,
  sessionId: string | undefined,
  userId: string | undefined,
  tracker: Tracker,
): AsyncGenerator<StreamChunk> {
  let lastChunk: StreamChunk | undefined
  for await (const chunk of stream) {
    lastChunk = chunk
    yield chunk
  }
  if (lastChunk?.usage) {
    const { inputTokens, outputTokens } = extractUsage(lastChunk.usage)
    trackWithMeta(tracker, model, inputTokens, outputTokens, sessionId, userId)
  }
}

// ─── Public wrapper ───────────────────────────────────────────────────────────

/**
 * Wraps an OpenAI client (or any OpenAI-compatible client) to transparently
 * intercept chat.completions.create calls and report token usage to the tracker.
 *
 * The returned client is typed to accept __sessionId and __userId alongside the
 * normal params — no type cast required at the call site.
 */
export function wrapOpenAI<T extends OpenAILike>(client: T, tracker: Tracker): WrappedOpenAI<T> {
  const proxiedCompletions = new Proxy(client.chat.completions, {
    get(target, prop) {
      if (prop !== 'create')
        return (target as unknown as Record<string | symbol, unknown>)[prop]

      return async function (params: Record<string, unknown>) {
        const { cleaned, sessionId, userId } = extractMeta(params)
        const model = typeof cleaned['model'] === 'string' ? cleaned['model'] : 'unknown'

        let result: unknown
        try {
          result = await (target as CompletionsLike).create(cleaned)
        } catch (err) {
          throw err
        }

        if (result && typeof result === 'object' && Symbol.asyncIterator in result) {
          return wrapStream(
            result as AsyncIterable<StreamChunk>,
            model,
            sessionId,
            userId,
            tracker,
          )
        }

        const completion = result as Completion
        const { inputTokens, outputTokens } = extractUsage(completion.usage)
        trackWithMeta(
          tracker,
          completion.model ?? model,
          inputTokens,
          outputTokens,
          sessionId,
          userId,
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

  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'chat') return proxiedChat
      return (target as unknown as Record<string | symbol, unknown>)[prop]
    },
  }) as unknown as WrappedOpenAI<T>
}
