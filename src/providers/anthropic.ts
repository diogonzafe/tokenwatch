import type { Tracker, TrackingMeta } from '../types/index.js'

// ─── Minimal structural types ─────────────────────────────────────────────────

interface AnthropicUsage {
  input_tokens?: number
  output_tokens?: number
  /** Tokens read from prompt cache — billed at ~10% of input price */
  cache_read_input_tokens?: number
  /** Tokens written to prompt cache — billed at ~125% of input price */
  cache_creation_input_tokens?: number
}

interface ContentBlock {
  type: string
}

interface ThinkingBlock extends ContentBlock {
  type: 'thinking'
  thinking?: string
}

interface AnthropicMessage {
  model?: string
  usage?: AnthropicUsage | null
  content?: ContentBlock[]
}

interface AnthropicStreamEvent {
  type?: string
  usage?: AnthropicUsage | null
  message?: AnthropicMessage
  /** Emitted on content_block_start — describes the block type */
  content_block?: ContentBlock
  /** Emitted on content_block_delta — carries incremental content */
  delta?: { type?: string; thinking?: string; text?: string }
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

function extractUsage(usage: AnthropicUsage | null | undefined): {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  cacheCreationTokens: number
} {
  if (!usage) return { inputTokens: 0, outputTokens: 0, cachedTokens: 0, cacheCreationTokens: 0 }
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cachedTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
  }
}

/**
 * Anthropic extended thinking: count characters from thinking content blocks
 * and divide by 4 as a rough token approximation.
 *
 * Note: Anthropic already includes thinking output tokens inside outputTokens
 * (message_delta usage.output_tokens). The reasoningTokens value stored here
 * is INFORMATIONAL ONLY — it is NOT added to the cost calculation to avoid
 * double-counting.
 */
function extractThinkingTokenApprox(content: ContentBlock[] | undefined): number {
  if (!content) return 0
  const chars = content
    .filter((b): b is ThinkingBlock => b.type === 'thinking')
    .reduce((sum, b) => sum + (b.thinking?.length ?? 0), 0)
  return chars > 0 ? Math.round(chars / 4) : 0
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
  cachedTokens = 0,
  cacheCreationTokens = 0,
): void {
  // Anthropic thinking output is already included in outputTokens — no adjustment needed.
  // reasoningTokens here is an approximation (thinking chars ÷ 4) stored purely for
  // report.byModel[x].tokens.reasoning. The tracker does NOT add it to cost.
  tracker.track({
    model,
    inputTokens,
    outputTokens,
    ...(reasoningTokens > 0 && { reasoningTokens }),
    ...(cachedTokens > 0 && { cachedTokens }),
    ...(cacheCreationTokens > 0 && { cacheCreationTokens }),
    ...(sessionId !== undefined && { sessionId }),
    ...(userId !== undefined && { userId }),
    ...(feature !== undefined && { feature }),
  })
}

// ─── Streaming wrapper ────────────────────────────────────────────────────────

async function* wrapStream(
  stream: AsyncIterable<AnthropicStreamEvent>,
  model: string,
  sessionId: string | undefined,
  userId: string | undefined,
  feature: string | undefined,
  tracker: Tracker,
): AsyncGenerator<AnthropicStreamEvent> {
  let inputTokens = 0
  let outputTokens = 0
  let cachedTokens = 0
  let cacheCreationTokens = 0
  let currentBlockIsThinking = false
  let thinkingCharCount = 0

  for await (const event of stream) {
    yield event

    if (event.type === 'message_start' && event.message?.usage) {
      inputTokens = event.message.usage.input_tokens ?? 0
      cachedTokens = event.message.usage.cache_read_input_tokens ?? 0
      cacheCreationTokens = event.message.usage.cache_creation_input_tokens ?? 0
    }
    if (event.type === 'message_delta' && event.usage) {
      outputTokens = event.usage.output_tokens ?? 0
    }

    // Track thinking blocks for informational reasoningTokens approximation
    if (event.type === 'content_block_start') {
      currentBlockIsThinking = event.content_block?.type === 'thinking'
    }
    if (event.type === 'content_block_stop') {
      currentBlockIsThinking = false
    }
    if (event.type === 'content_block_delta' && currentBlockIsThinking && event.delta?.thinking) {
      thinkingCharCount += event.delta.thinking.length
    }
  }

  // reasoningTokens is approximate and informational — Anthropic thinking output
  // is already included in outputTokens, so it is NOT added to cost by the tracker.
  const reasoningTokens = thinkingCharCount > 0 ? Math.round(thinkingCharCount / 4) : 0
  trackWithMeta(tracker, model, inputTokens, outputTokens, reasoningTokens, sessionId, userId, feature, cachedTokens, cacheCreationTokens)
}

// ─── Public wrapper ───────────────────────────────────────────────────────────

/**
 * Wraps an Anthropic client to transparently intercept messages.create calls
 * and report token usage to the tracker.
 *
 * The returned client is typed to accept __sessionId, __userId, and __feature
 * alongside the normal params — no type cast required at the call site.
 *
 * For extended thinking models, reasoningTokens is stored as an approximation
 * (thinking block characters ÷ 4). It is informational only — thinking output
 * is already included in outputTokens and is not double-counted in cost.
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
        const { cleaned, sessionId, userId, feature } = extractMeta(params)
        const model = typeof cleaned['model'] === 'string' ? cleaned['model'] : 'unknown'

        const result = await (target as MessagesLike).create(cleaned)

        if (result && typeof result === 'object' && Symbol.asyncIterator in result) {
          return wrapStream(
            result as AsyncIterable<AnthropicStreamEvent>,
            model,
            sessionId,
            userId,
            feature,
            tracker,
          )
        }

        const message = result as AnthropicMessage
        const { inputTokens, outputTokens, cachedTokens, cacheCreationTokens } = extractUsage(message.usage)
        const reasoningTokens = extractThinkingTokenApprox(message.content)
        trackWithMeta(
          tracker,
          message.model ?? model,
          inputTokens,
          outputTokens,
          reasoningTokens,
          sessionId,
          userId,
          feature,
          cachedTokens,
          cacheCreationTokens,
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
