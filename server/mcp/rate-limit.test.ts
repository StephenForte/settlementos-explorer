import { describe, expect, it, vi } from 'vitest'
import { createRateLimiter } from './rate-limit.ts'

function mockRes() {
  const headers = new Map<string, string>()
  return {
    headers,
    statusCode: 200,
    body: null as unknown,
    setHeader(key: string, value: string) {
      headers.set(key, value)
    },
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
  }
}

describe('createRateLimiter', () => {
  it('allows traffic under the limit and blocks over it', () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 2,
      keyFn: () => 'test-ip',
    })
    const next = vi.fn()
    const req = { ip: '1.2.3.4' } as never

    const a = mockRes()
    limiter(req, a as never, next)
    expect(next).toHaveBeenCalledTimes(1)

    const b = mockRes()
    limiter(req, b as never, next)
    expect(next).toHaveBeenCalledTimes(2)

    const c = mockRes()
    limiter(req, c as never, next)
    expect(next).toHaveBeenCalledTimes(2)
    expect(c.statusCode).toBe(429)
  })
})
