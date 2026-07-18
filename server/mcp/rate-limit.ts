/**
 * Simple fixed-window rate limiter for MCP POSTs (in-memory, per process).
 */

import type { NextFunction, Request, Response } from 'express'

type Bucket = { count: number; resetAt: number }

export function createRateLimiter(opts: {
  windowMs: number
  max: number
  keyFn?: (req: Request) => string
}) {
  const buckets = new Map<string, Bucket>()
  const keyFn =
    opts.keyFn ??
    ((req: Request) => req.ip || req.socket.remoteAddress || 'unknown')

  return function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const key = keyFn(req)
    const now = Date.now()
    let bucket = buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + opts.windowMs }
      buckets.set(key, bucket)
    }
    bucket.count += 1
    res.setHeader('X-RateLimit-Limit', String(opts.max))
    res.setHeader(
      'X-RateLimit-Remaining',
      String(Math.max(0, opts.max - bucket.count)),
    )
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)))
    if (bucket.count > opts.max) {
      return res.status(429).json({
        error: 'Too many requests. Try again shortly.',
      })
    }
    return next()
  }
}
