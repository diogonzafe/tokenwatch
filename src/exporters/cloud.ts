import type { IExporter, UsageEntry } from '../types/index.js'

const DEFAULT_ENDPOINT = 'https://api.tokenwatch.dev/v1/ingest'

export class CloudExporter implements IExporter {
  private readonly endpoint: string

  constructor(
    private readonly apiKey: string,
    endpoint?: string,
  ) {
    this.endpoint = endpoint ?? DEFAULT_ENDPOINT
  }

  export(entry: UsageEntry): void {
    fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
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
        metadata: entry.metadata,
        timestamp: entry.timestamp,
      }),
    }).catch(() => {
      // fire-and-forget — cloud failure never interrupts the caller
    })
  }
}
