import crypto from 'node:crypto'

/** Timing-safe string equality (pads via SHA-256 digests so lengths don't leak). */
export function timingSafeEqualString(a: string, b: string): boolean {
  const digA = crypto.createHash('sha256').update(String(a), 'utf8').digest()
  const digB = crypto.createHash('sha256').update(String(b), 'utf8').digest()
  return crypto.timingSafeEqual(digA, digB)
}
