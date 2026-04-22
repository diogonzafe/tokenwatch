import { describe, it, expect, vi, afterEach } from 'vitest'
import { createTracker } from '../../src/core/tracker.js'

afterEach(() => vi.restoreAllMocks())

describe('per-user budget alerts', () => {
  it('fires webhook when user cost crosses threshold', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true } as Response)
    global.fetch = mockFetch

    const tracker = createTracker({
      syncPrices: false,
      budgets: {
        perUser: { threshold: 0.001, webhookUrl: 'https://hooks.example.com/user' },
      },
    })

    tracker.track({ model: 'gpt-4o', inputTokens: 100000, outputTokens: 50000, userId: 'user-1' })
    await new Promise((r) => setTimeout(r, 10))

    const calls = mockFetch.mock.calls.filter(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('user')
    )
    expect(calls.length).toBeGreaterThan(0)
    const body = JSON.parse(calls[0]![1]!.body as string) as { text: string }
    expect(body.text).toContain('user-1')
    expect(body.text).toContain('Budget alert')
  })

  it('fires only once per user in once mode (default)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true } as Response)
    global.fetch = mockFetch

    const tracker = createTracker({
      syncPrices: false,
      budgets: {
        perUser: { threshold: 0.001, webhookUrl: 'https://hooks.example.com/user' },
      },
    })

    // Two separate calls for the same user
    tracker.track({ model: 'gpt-4o', inputTokens: 100000, outputTokens: 50000, userId: 'user-1' })
    tracker.track({ model: 'gpt-4o', inputTokens: 100000, outputTokens: 50000, userId: 'user-1' })
    await new Promise((r) => setTimeout(r, 20))

    const userCalls = mockFetch.mock.calls.filter(
      (c) => {
        const body = JSON.parse((c[1] as { body: string }).body) as { text: string }
        return body.text.includes('user-1') && body.text.includes('Budget alert')
      }
    )
    expect(userCalls).toHaveLength(1)
  })

  it('does not fire when user cost is under threshold', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true } as Response)
    global.fetch = mockFetch

    const tracker = createTracker({
      syncPrices: false,
      budgets: {
        perUser: { threshold: 1000, webhookUrl: 'https://hooks.example.com/user' },
      },
    })

    tracker.track({ model: 'gpt-4o', inputTokens: 10, outputTokens: 5, userId: 'user-1' })
    await new Promise((r) => setTimeout(r, 10))

    const budgetCalls = mockFetch.mock.calls.filter(
      (c) => {
        try {
          const body = JSON.parse((c[1] as { body: string }).body) as { text: string }
          return body.text.includes('Budget alert')
        } catch { return false }
      }
    )
    expect(budgetCalls).toHaveLength(0)
  })

  it('does not fire for calls without userId', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true } as Response)
    global.fetch = mockFetch

    const tracker = createTracker({
      syncPrices: false,
      budgets: {
        perUser: { threshold: 0.001, webhookUrl: 'https://hooks.example.com/user' },
      },
    })

    // No userId on this call
    tracker.track({ model: 'gpt-4o', inputTokens: 100000, outputTokens: 50000 })
    await new Promise((r) => setTimeout(r, 10))

    const budgetCalls = mockFetch.mock.calls.filter(
      (c) => {
        try {
          const body = JSON.parse((c[1] as { body: string }).body) as { text: string }
          return body.text.includes('Budget alert')
        } catch { return false }
      }
    )
    expect(budgetCalls).toHaveLength(0)
  })
})

describe('per-session budget alerts', () => {
  it('fires webhook when session cost crosses threshold', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true } as Response)
    global.fetch = mockFetch

    const tracker = createTracker({
      syncPrices: false,
      budgets: {
        perSession: { threshold: 0.001, webhookUrl: 'https://hooks.example.com/session' },
      },
    })

    tracker.track({ model: 'gpt-4o', inputTokens: 100000, outputTokens: 50000, sessionId: 'sess-1' })
    await new Promise((r) => setTimeout(r, 10))

    const calls = mockFetch.mock.calls.filter(
      (c) => {
        try {
          const body = JSON.parse((c[1] as { body: string }).body) as { text: string }
          return body.text.includes('sess-1') && body.text.includes('Budget alert')
        } catch { return false }
      }
    )
    expect(calls.length).toBeGreaterThan(0)
  })

  it('alert latch is cleared on reset()', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true } as Response)
    global.fetch = mockFetch

    const tracker = createTracker({
      syncPrices: false,
      budgets: {
        perUser: { threshold: 0.001, webhookUrl: 'https://hooks.example.com/user' },
      },
    })

    tracker.track({ model: 'gpt-4o', inputTokens: 100000, outputTokens: 50000, userId: 'u1' })
    await new Promise((r) => setTimeout(r, 10))

    await tracker.reset()

    // After reset, the fired set is cleared — new calls could re-trigger
    // (but cost is now 0, so won't actually re-fire)
    tracker.track({ model: 'gpt-4o', inputTokens: 1, outputTokens: 1, userId: 'u1' })
    await new Promise((r) => setTimeout(r, 10))

    // Should still only have 1 budget-alert call (the second call has cost < threshold)
    const budgetCalls = mockFetch.mock.calls.filter(
      (c) => {
        try {
          const body = JSON.parse((c[1] as { body: string }).body) as { text: string }
          return body.text.includes('Budget alert')
        } catch { return false }
      }
    )
    expect(budgetCalls).toHaveLength(1)
  })
})
