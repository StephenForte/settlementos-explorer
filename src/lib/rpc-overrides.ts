import type { NetworkId } from '../config/networks'

/** localStorage key for per-network user RPC overrides. */
export const RPC_OVERRIDE_STORAGE_KEY = 'settlementos.rpcOverrides'

export type RpcUrlValidation =
  | { ok: true; url: string }
  | { ok: false; error: string }

/**
 * Feature-detect storage the same way `getEnv` feature-detects process.env.
 * Node (MCP server, vitest node env) has no localStorage — must not throw.
 */
function browserStorage(): Storage | null {
  try {
    const store = (globalThis as { localStorage?: Storage }).localStorage
    if (!store || typeof store.getItem !== 'function') return null
    return store
  } catch {
    return null
  }
}

function readAll(): Partial<Record<NetworkId, string>> {
  const store = browserStorage()
  if (!store) return {}
  try {
    const raw = store.getItem(RPC_OVERRIDE_STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Partial<Record<NetworkId, string>> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.trim()) {
        out[key as NetworkId] = value.trim()
      }
    }
    return out
  } catch {
    return {}
  }
}

function writeAll(map: Partial<Record<NetworkId, string>>): void {
  const store = browserStorage()
  if (!store) return
  const cleaned: Partial<Record<NetworkId, string>> = {}
  for (const [key, value] of Object.entries(map)) {
    if (typeof value === 'string' && value.trim()) {
      cleaned[key as NetworkId] = value.trim()
    }
  }
  if (Object.keys(cleaned).length === 0) {
    store.removeItem(RPC_OVERRIDE_STORAGE_KEY)
    return
  }
  store.setItem(RPC_OVERRIDE_STORAGE_KEY, JSON.stringify(cleaned))
}

/**
 * Accept only http(s) URLs. Reject javascript:, data:, file:, bare hostnames.
 * Does not probe the endpoint — scheme check only (F6j / D16).
 */
export function validateRpcOverrideUrl(raw: string): RpcUrlValidation {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: false, error: 'Enter an HTTP or HTTPS RPC URL.' }
  }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { ok: false, error: 'Enter a valid HTTP or HTTPS RPC URL.' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      error: 'Only http: and https: RPC endpoints are allowed.',
    }
  }
  if (!parsed.hostname) {
    return { ok: false, error: 'Enter a valid HTTP or HTTPS RPC URL.' }
  }
  return { ok: true, url: trimmed }
}

export function getRpcOverride(networkId: NetworkId): string | undefined {
  return readAll()[networkId]
}

export function getAllRpcOverrides(): Partial<Record<NetworkId, string>> {
  return { ...readAll() }
}

/**
 * Persist an override for one network. Caller must validate first (or use the
 * clients.ts helpers that validate + invalidate). Explicit write only —
 * never auto-persists from a draft field.
 */
export function setRpcOverride(networkId: NetworkId, url: string): RpcUrlValidation {
  const validated = validateRpcOverrideUrl(url)
  if (!validated.ok) return validated
  const next = readAll()
  next[networkId] = validated.url
  writeAll(next)
  return validated
}

export function clearRpcOverride(networkId: NetworkId): void {
  const next = readAll()
  delete next[networkId]
  writeAll(next)
}
