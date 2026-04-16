import type { Tracker } from '../types/index.js'

// ─── Minimal structural types ─────────────────────────────────────────────────

interface UsageMetadata {
  promptTokenCount?: number
  candidatesTokenCount?: number
  totalTokenCount?: number
}

interface GenerateContentResponse {
  usageMetadata?: UsageMetadata | null
}

interface GenerativeModelLike {
  generateContent(params: unknown): Promise<{ response: GenerateContentResponse }>
  generateContentStream(
    params: unknown,
  ): Promise<{
    stream: AsyncIterable<{ usageMetadata?: UsageMetadata | null }>
    response: Promise<GenerateContentResponse>
  }>
  model?: string
}

interface GenAILike {
  getGenerativeModel(params: { model: string } & Record<string, unknown>): GenerativeModelLike
}

// ─── Public wrapper ───────────────────────────────────────────────────────────

/**
 * Wraps a GoogleGenerativeAI client to transparently intercept
 * generateContent / generateContentStream calls and report token usage.
 *
 * Returns the same type T that was passed in.
 */
export function wrapGemini<T extends GenAILike>(client: T, tracker: Tracker): T {
  return new Proxy(client, {
    get(target, prop) {
      if (prop !== 'getGenerativeModel')
        return (target as Record<string | symbol, unknown>)[prop]

      return function (modelParams: { model: string } & Record<string, unknown>) {
        const modelInstance = target.getGenerativeModel(modelParams)
        const modelId = modelParams.model

        return new Proxy(modelInstance, {
          get(mTarget, mProp) {
            if (mProp === 'generateContent') {
              return async function (params: unknown) {
                const result = await mTarget.generateContent(params)
                const meta = result.response.usageMetadata
                tracker.track({
                  model: modelId,
                  inputTokens: meta?.promptTokenCount ?? 0,
                  outputTokens: meta?.candidatesTokenCount ?? 0,
                })

                return result
              }
            }

            if (mProp === 'generateContentStream') {
              return async function (params: unknown) {
                const streamResult = await mTarget.generateContentStream(params)

                // Consume usage from the resolved response promise after streaming
                streamResult.response
                  .then((res) => {
                    const meta = res.usageMetadata
                    tracker.track({
                      model: modelId,
                      inputTokens: meta?.promptTokenCount ?? 0,
                      outputTokens: meta?.candidatesTokenCount ?? 0,
                    })
                  })
                  .catch(() => {
                    // best-effort
                  })

                return streamResult
              }
            }

            return (mTarget as unknown as Record<string | symbol, unknown>)[mProp]
          },
        })
      }
    },
  }) as T
}
