/**
 * CORS allowlist for MCP / OAuth browser probes (Claude, Cursor, local dev).
 * Server-to-server callers omit Origin and are unaffected.
 */

const ALLOWED_ORIGIN_HOSTS = new Set([
  'claude.ai',
  'www.claude.ai',
  'claude.com',
  'www.claude.com',
  'cursor.com',
  'www.cursor.com',
])

export function isAllowedCorsOrigin(origin: string | undefined): boolean {
  if (!origin) return false
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false
  }
  const host = parsed.hostname.toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1') return true
  if (ALLOWED_ORIGIN_HOSTS.has(host)) return true
  // Allow preview / custom deploy hosts that match the request Host when needed
  // is handled by reflecting only allowlisted origins above.
  return false
}

export function corsOriginDelegate(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void {
  if (!origin) {
    // Non-browser clients (no Origin) — allow without ACAO reflection.
    callback(null, true)
    return
  }
  callback(null, isAllowedCorsOrigin(origin))
}
