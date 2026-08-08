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

  it('cached() honours per-call ttlMs', async () => {
    vi.useFakeTimers()
    const fn = vi.fn(async () => 'fresh')
    await cached('ttl-key', fn, 500)
    expect(fn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(501)
    await cached('ttl-key', fn, 500)
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('epoch guard', () => {
  it('discards a write from a superseded epoch after cacheClear', async () => {
    cacheClear()
    let release!: (v: string) => void
    const slow = new Promise<string>((r) => {
      release = r
    })

    const p1 = cached('balances:polygon-amoy:0xabc', () => slow)
    cacheClear()
    const p2 = cached('balances:polygon-amoy:0xabc', async () => 'ok-new')
    await expect(p2).resolves.toBe('ok-new')
    expect(cacheGet('balances:polygon-amoy:0xabc')).toBe('ok-new')

    release('unavailable-stale')
    await p1

    expect(cacheGet('balances:polygon-amoy:0xabc')).toBe('ok-new')
  })

  it('does not delete a current in-flight entry when a superseded epoch settles', async () => {
    let releaseP1!: (v: string) => void
    let releaseP2!: (v: string) => void
    const oldFn = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          releaseP1 = resolve
        }),
    )
    const newFn = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          releaseP2 = resolve
        }),
    )

    const p1 = cached('k', oldFn)
    cacheClear()
    const p2 = cached('k', newFn)
    expect(newFn).toHaveBeenCalledTimes(1)

    releaseP1('stale')
    await p1

    const p3 = cached('k', newFn)
    expect(newFn).toHaveBeenCalledTimes(1)

    releaseP2('current')
    await expect(p2).resolves.toBe('current')
    await expect(p3).resolves.toBe('current')
    expect(newFn).toHaveBeenCalledTimes(1)
  })

  it('deduplicates two concurrent same-key calls within one epoch', async () => {
    let resolveFn!: (value: number) => void
    const fn = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          resolveFn = resolve
        }),
    )
    const a = cached('dedupe', fn)
    const b = cached('dedupe', fn)
    expect(fn).toHaveBeenCalledTimes(1)
    resolveFn(99)
    await expect(a).resolves.toBe(99)
    await expect(b).resolves.toBe(99)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('cleans up inflight after an in-epoch rejection so the next call retries', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('rpc down'))
      .mockResolvedValueOnce('recovered')

    await expect(cached('reject-key', fn)).rejects.toThrow('rpc down')
    await expect(cached('reject-key', fn)).resolves.toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('does not disturb the current epoch when a superseded epoch rejects', async () => {
    let rejectOld!: (err: Error) => void
    const oldSlow = new Promise<string>((_, reject) => {
      rejectOld = reject
    })
    const fn = vi.fn()
      .mockImplementationOnce(() => oldSlow)
      .mockResolvedValueOnce('ok-new')

    const p1 = cached('k', () => fn())
    cacheClear()
    const p2 = cached('k', () => fn())
    await expect(p2).resolves.toBe('ok-new')
    expect(cacheGet('k')).toBe('ok-new')

    rejectOld(new Error('stale failure'))
    await expect(p1).rejects.toThrow('stale failure')

    expect(cacheGet('k')).toBe('ok-new')
    await expect(cached('k', async () => 'still-cached')).resolves.toBe('ok-new')
  })
})
