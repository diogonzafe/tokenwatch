import type { Tracker } from '../types/index.js'

// ─── Local type stubs ─────────────────────────────────────────────────────────
// These mirror the minimal shape of @langchain/core types so this file compiles
// without a hard compile-time dependency on @langchain/core.

interface TokenUsage {
  promptTokens?: number
  completionTokens?: number
}

interface Generation {
  message?: {
    response_metadata?: {
      model_name?: string
    }
  }
}

interface LLMResult {
  llmOutput?: {
    tokenUsage?: TokenUsage
    estimatedTokenUsage?: TokenUsage
  } | null
  generations: Generation[][]
}

/**
 * Minimal stub that mirrors the shape of BaseCallbackHandler from @langchain/core.
 * Extend this so the class compiles without the peer dependency being installed.
 * LangChain's callback system is duck-typed and will call the methods that exist.
 */
abstract class BaseCallbackHandlerStub {
  abstract name: string
  handleLLMStart?(...args: unknown[]): Promise<void> | void
  handleLLMEnd?(output: LLMResult, ...args: unknown[]): Promise<void> | void
  handleLLMError?(...args: unknown[]): Promise<void> | void
  handleChainStart?(...args: unknown[]): Promise<void> | void
  handleChainEnd?(...args: unknown[]): Promise<void> | void
  handleChainError?(...args: unknown[]): Promise<void> | void
  handleToolStart?(...args: unknown[]): Promise<void> | void
  handleToolEnd?(...args: unknown[]): Promise<void> | void
  handleToolError?(...args: unknown[]): Promise<void> | void
  handleAgentAction?(...args: unknown[]): Promise<void> | void
  handleAgentEnd?(...args: unknown[]): Promise<void> | void
  handleText?(...args: unknown[]): Promise<void> | void
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface TokenwatchCallbackHandlerOptions {
  /** Fallback model name when the response does not include it. Defaults to 'unknown'. */
  defaultModel?: string
  /** Tag all calls from this handler with a session ID */
  sessionId?: string
  /** Tag all calls from this handler with a user ID */
  userId?: string
  /** Tag all calls from this handler with a product feature name */
  feature?: string
}

// ─── Handler ──────────────────────────────────────────────────────────────────

/**
 * LangChain callback handler that automatically tracks LLM cost via tokenwatch.
 *
 * @example
 * import { TokenwatchCallbackHandler } from '@diogonzafe/tokenwatch/langchain'
 *
 * const handler = new TokenwatchCallbackHandler(tracker, { defaultModel: 'gpt-4o' })
 * const llm = new ChatOpenAI({ model: 'gpt-4o', callbacks: [handler] })
 */
export class TokenwatchCallbackHandler extends BaseCallbackHandlerStub {
  name = 'TokenwatchCallbackHandler' as const

  constructor(
    private readonly tracker: Tracker,
    private readonly options: TokenwatchCallbackHandlerOptions = {},
  ) {
    super()
  }

  async handleLLMEnd(output: LLMResult): Promise<void> {
    // Prefer exact tokenUsage, fall back to estimatedTokenUsage (streaming)
    const tokenUsage = output.llmOutput?.tokenUsage ?? output.llmOutput?.estimatedTokenUsage

    const inputTokens = tokenUsage?.promptTokens ?? 0
    const outputTokens = tokenUsage?.completionTokens ?? 0

    // noUncheckedIndexedAccess: generations[0] is Generation[] | undefined
    const firstGenerations = output.generations[0]
    const firstGen = firstGenerations?.[0]
    const modelFromResponse = firstGen?.message?.response_metadata?.model_name
    const model = modelFromResponse ?? this.options.defaultModel ?? 'unknown'

    const { sessionId, userId, feature } = this.options

    this.tracker.track({
      model,
      inputTokens,
      outputTokens,
      ...(sessionId !== undefined && { sessionId }),
      ...(userId !== undefined && { userId }),
      ...(feature !== undefined && { feature }),
    })
  }
}
