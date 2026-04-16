import type { Tracker, TrackingMeta } from '../types/index.js'

// ─── Minimal structural types ─────────────────────────────────────────────────

interface AnthropicUsage {
  input_tokens?: number
  output_tokens?: number
}

interface AnthropicMessage {
  model?: string
  usage?: AnthropicUsage | null
}

interface AnthropicStreamEvent {
  type?: string
  usage?: AnthropicUsage | null
  message?: AnthropicMessage
}

interface MessagesLike {
  create(params: Record<string, unknown>): Promise<unknown>
}

type AnthropicLike = { messages: MessagesLike } & Record<string, unknown>

// ─── Augmented return type ────────────────────────────────────────────────────

type AugmentedCreate<TCreate extends (...args: any[]) => any> = (
  params: Parameters<TCreate>[0] & TrackingMeta,
) => ReturnType<TCreate>

type WrappedAnthropic<T extends AnthropicLike> = Omit<T, 'messages'> & {
  messages: Omit<T['messages'], 'create'> & {
    create: AugmentedCreate<T['messages']['create']>
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

function extractUsage(usage: AnthropicUsage | null | undefined): {
  inputTokens: number
  outputTokens: number
} {
  if (!usage) return { inputTokens: 0, outputTokens: 0 }
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
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
  stream: AsyncIterable<AnthropicStreamEvent>,
  model: string,
  sessionId: string | undefined,
  userId: string | undefined,
  tracker: Tracker,
): AsyncGenerator<AnthropicStreamEvent> {
  let inputTokens = 0
  let outputTokens = 0

  for await (const event of stream) {
    yield event

    if (event.type === 'message_start' && event.message?.usage) {
      inputTokens = event.message.usage.input_tokens ?? 0
    }
    if (event.type === 'message_delta' && event.usage) {
      outputTokens = event.usage.output_tokens ?? 0
    }
  }

  if (inputTokens > 0 || outputTokens > 0) {
    trackWithMeta(tracker, model, inputTokens, outputTokens, sessionId, userId)
  }
}

// ─── Public wrapper ───────────────────────────────────────────────────────────

/**
 * Wraps an Anthropic client to transparently intercept messages.create calls
 * and report token usage to the tracker.
 *
 * The returned client is typed to accept __sessionId and __userId alongside the
 * normal params — no type cast required at the call site.
 */
export function wrapAnthropic<T extends AnthropicLike>(
  client: T,
  tracker: Tracker,
): WrappedAnthropic<T> {
  const proxiedMessages = new Proxy(client.messages, {
    get(target, prop) {
      if (prop !== 'create')
        return (target as unknown as Record<string | symbol, unknown>)[prop]

      return async function (params: Record<string, unknown>) {
        const { cleaned, sessionId, userId } = extractMeta(params)
        const model = typeof cleaned['model'] === 'string' ? cleaned['model'] : 'unknown'

        let result: unknown
        try {
          result = await (target as MessagesLike).create(cleaned)
        } catch (err) {
          throw err
        }

        if (result && typeof result === 'object' && Symbol.asyncIterator in result) {
          return wrapStream(
            result as AsyncIterable<AnthropicStreamEvent>,
            model,
            sessionId,
            userId,
            tracker,
          )
        }

        const message = result as AnthropicMessage
        const { inputTokens, outputTokens } = extractUsage(message.usage)
        trackWithMeta(
          tracker,
          message.model ?? model,
          inputTokens,
          outputTokens,
          sessionId,
          userId,
        )

        return result
      }
    },
  })

  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'messages') return proxiedMessages
      return (target as unknown as Record<string | symbol, unknown>)[prop]
    },
  }) as unknown as WrappedAnthropic<T>
}
