interface CacheEntry<T> {
  value: T
  expiresAt: number
}

const DEFAULT_TTL_MS = 30_000

const store = new Map<string, CacheEntry<unknown>>()

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return undefined
  }
  return entry.value as T
}

export function cacheSet<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs })
}

export function cacheClear(): void {
  store.clear()
}

export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS,
): Promise<T> {
  const hit = cacheGet<T>(key)
  if (hit !== undefined) return hit
  const value = await fn()
  cacheSet(key, value, ttlMs)
  return value
}
