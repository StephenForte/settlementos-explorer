import { afterEach, describe, expect, it, vi } from 'vitest'
import { cacheClear, cacheGet, cacheSet, cached } from './cache'

afterEach(() => {
  cacheClear()
  vi.useRealTimers()
})

describe('cache', () => {
  it('stores and retrieves values', () => {
    cacheSet('k', { n: 1 })
    expect(cacheGet<{ n: number }>('k')).toEqual({ n: 1 })
  })

  it('expires entries after ttl', () => {
    vi.useFakeTimers()
    cacheSet('k', 'v', 1_000)
    expect(cacheGet('k')).toBe('v')
    vi.advanceTimersByTime(1_001)
    expect(cacheGet('k')).toBeUndefined()
  })

  it('cached() returns memoized result within ttl', async () => {
    const fn = vi.fn(async () => 42)
    await expect(cached('sum', fn)).resolves.toBe(42)
    await expect(cached('sum', fn)).resolves.toBe(42)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('cached() deduplicates concurrent in-flight requests', async () => {
    let resolveFn!: (value: number) => void
    const fn = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          resolveFn = resolve
        }),
    )
    const a = cached('inflight', fn)
    const b = cached('inflight', fn)
    expect(fn).toHaveBeenCalledTimes(1)
    resolveFn(7)
    await expect(a).resolves.toBe(7)
    await expect(b).resolves.toBe(7)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
