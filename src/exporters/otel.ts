import type { UsageEntry, IExporter } from '../types/index.js'

// ─── Local type stubs ─────────────────────────────────────────────────────────
// Mirror the minimal shape of @opentelemetry/api so this file compiles without
// a hard compile-time dependency on the package.

interface OTelAttributes {
  [key: string]: string | number | boolean | undefined
}

interface OTelCounter {
  add(value: number, attributes?: OTelAttributes): void
}

interface OTelHistogram {
  record(value: number, attributes?: OTelAttributes): void
}

interface OTelMeter {
  createCounter(name: string, options?: { description?: string; unit?: string }): OTelCounter
  createHistogram(name: string, options?: { description?: string; unit?: string }): OTelHistogram
}

interface OTelMetricsAPI {
  getMeter(name: string, version?: string): OTelMeter
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface OTelExporterOptions {
  /**
   * Name passed to `metrics.getMeter()`.
   * @default 'tokenwatch'
   */
  meterName?: string
}

/**
 * OpenTelemetry exporter for tokenwatch.
 *
 * Requires `@opentelemetry/api` to be installed in your project and a
 * `MeterProvider` to be registered globally (e.g. via the OTel SDK).
 *
 * Emits four instruments per tracked call:
 * - `tokenwatch.calls`         — Counter
 * - `tokenwatch.input_tokens`  — Counter
 * - `tokenwatch.output_tokens` — Counter
 * - `tokenwatch.cost_usd`      — Histogram
 *
 * Attributes: `model`, `session.id` (optional), `user.id` (optional), `feature` (optional)
 *
 * @example
 * import { OTelExporter } from '@diogonzafe/tokenwatch/exporters'
 *
 * const tracker = createTracker({ exporter: new OTelExporter() })
 */
export class OTelExporter implements IExporter {
  private readonly calls: OTelCounter
  private readonly inputTokens: OTelCounter
  private readonly outputTokens: OTelCounter
  private readonly costUsd: OTelHistogram

  constructor(options: OTelExporterOptions = {}, _metricsApi?: OTelMetricsAPI) {
    let metricsApi: OTelMetricsAPI
    if (_metricsApi) {
      metricsApi = _metricsApi
    } else {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        metricsApi = (require('@opentelemetry/api') as { metrics: OTelMetricsAPI }).metrics
      } catch {
        throw new Error(
          '[tokenwatch] OTelExporter requires @opentelemetry/api. Run: npm install @opentelemetry/api',
        )
      }
    }
    const meter = metricsApi.getMeter(options.meterName ?? 'tokenwatch')
    this.calls = meter.createCounter('tokenwatch.calls', {
      description: 'Number of LLM API calls tracked',
    })
    this.inputTokens = meter.createCounter('tokenwatch.input_tokens', {
      description: 'Input tokens consumed (includes cached and cache-creation tokens)',
    })
    this.outputTokens = meter.createCounter('tokenwatch.output_tokens', {
      description: 'Output tokens generated',
    })
    this.costUsd = meter.createHistogram('tokenwatch.cost_usd', {
      description: 'Cost per LLM API call in USD',
      unit: 'USD',
    })
  }

  export(entry: UsageEntry): void {
    const attrs: OTelAttributes = { model: entry.model }
    if (entry.sessionId !== undefined) attrs['session.id'] = entry.sessionId
    if (entry.userId !== undefined) attrs['user.id'] = entry.userId
    if (entry.feature !== undefined) attrs['feature'] = entry.feature

    this.calls.add(1, attrs)
    this.inputTokens.add(entry.inputTokens + (entry.cachedTokens ?? 0) + (entry.cacheCreationTokens ?? 0), attrs)
    this.outputTokens.add(entry.outputTokens, attrs)
    this.costUsd.record(entry.costUSD, attrs)
  }
}
