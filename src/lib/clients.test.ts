import { afterEach, describe, expect, it } from 'vitest'
import { NETWORKS } from '../config/networks'
import { cacheSet, cached } from './cache'
import {
  clearNetworkRpcOverride,
  getPublicClient,
  invalidatePublicClient,
  isLoopbackRpcUrl,
  orderFortel2RpcUrls,
  resolveRpcUrls,
  setNetworkRpcOverride,
} from './clients'
import { getEnv } from './env'
import { RPC_OVERRIDE_STORAGE_KEY } from './rpc-overrides'

afterEach(() => {
  localStorage.removeItem(RPC_OVERRIDE_STORAGE_KEY)
  invalidatePublicClient()
})

/**
 * Mirror of `publicRpcUrl` in address-book.chain.test.ts — the liveness suite
 * must keep resolving NETWORKS / env, never user storage.
 */
function livenessSuiteRpcUrl(
  networkId: 'base-sepolia' | 'polygon-amoy',
): string {
  if (networkId === 'base-sepolia') {
    return (
      getEnv('VITE_BASE_SEPOLIA_RPC_URL', 'BASE_SEPOLIA_RPC_URL') ??
      NETWORKS['base-sepolia'].rpcUrl
    )
  }
  return (
    getEnv('VITE_POLYGON_AMOY_RPC_URL', 'POLYGON_AMOY_RPC_URL') ??
    NETWORKS['polygon-amoy'].rpcUrl
  )
}

describe('resolveRpcUrls + client invalidation', () => {
  it('override changes the URL set for the next client with no reload', () => {
    const before = resolveRpcUrls('polygon-amoy')
    expect(before[0]).not.toBe('https://user-override.example/rpc')

    const clientBefore = getPublicClient('polygon-amoy')
    const result = setNetworkRpcOverride(
      'polygon-amoy',
      'https://user-override.example/rpc',
    )
    expect(result.ok).toBe(true)

    // Property under test: same module session, next resolution + client differ.
    expect(resolveRpcUrls('polygon-amoy')).toEqual([
      'https://user-override.example/rpc',
    ])
    const clientAfter = getPublicClient('polygon-amoy')
    expect(clientAfter).not.toBe(clientBefore)
  })

  it('clearing restores the built-in default URL set', () => {
    const defaults = resolveRpcUrls('polygon-amoy')
    setNetworkRpcOverride('polygon-amoy', 'https://temp.example/rpc')
    expect(resolveRpcUrls('polygon-amoy')).toEqual(['https://temp.example/rpc'])

    clearNetworkRpcOverride('polygon-amoy')
    expect(resolveRpcUrls('polygon-amoy')).toEqual(defaults)
    expect(defaults.length).toBeGreaterThan(1)
  })

  it('per-network isolation: one override leaves others alone', () => {
    const baseBefore = resolveRpcUrls('base-sepolia')
    const forteBefore = resolveRpcUrls('fortel2-sepolia')
    setNetworkRpcOverride('polygon-amoy', 'https://amoy-only.example/rpc')

    expect(resolveRpcUrls('polygon-amoy')).toEqual([
      'https://amoy-only.example/rpc',
    ])
    expect(resolveRpcUrls('base-sepolia')).toEqual(baseBefore)
    expect(resolveRpcUrls('fortel2-sepolia')).toEqual(forteBefore)
  })

  it('invalidation clears shared data cache (balances and transfers keys)', async () => {
    cacheSet('balances:polygon-amoy:0xabc', { stale: true })
    cacheSet('transfers:polygon-amoy:0xabc', { stale: true })
    let calls = 0
    const p = cached('balances:polygon-amoy:0xabc', async () => {
      calls += 1
      return { fresh: true }
    })
    // Still serving the cacheSet value — cached() hits cacheGet first.
    await expect(p).resolves.toEqual({ stale: true })
    expect(calls).toBe(0)

    invalidatePublicClient('polygon-amoy')

    await expect(
      cached('balances:polygon-amoy:0xabc', async () => {
        calls += 1
        return { fresh: true }
      }),
    ).resolves.toEqual({ fresh: true })
    expect(calls).toBe(1)
  })
})

describe('drift guard: liveness suite ignores overrides', () => {
  it('NETWORKS and liveness URL resolution stay on shipped config with override set', () => {
    const shippedAmoy = NETWORKS['polygon-amoy'].rpcUrl
    const shippedBase = NETWORKS['base-sepolia'].rpcUrl
    const beforeAmoy = livenessSuiteRpcUrl('polygon-amoy')
    const beforeBase = livenessSuiteRpcUrl('base-sepolia')

    setNetworkRpcOverride('polygon-amoy', 'https://personal-endpoint.example/rpc')
    setNetworkRpcOverride('base-sepolia', 'https://other-personal.example/rpc')

    expect(NETWORKS['polygon-amoy'].rpcUrl).toBe(shippedAmoy)
    expect(NETWORKS['base-sepolia'].rpcUrl).toBe(shippedBase)
    expect(livenessSuiteRpcUrl('polygon-amoy')).toBe(beforeAmoy)
    expect(livenessSuiteRpcUrl('base-sepolia')).toBe(beforeBase)
    // Contrast: the app client path does use the override.
    expect(resolveRpcUrls('polygon-amoy')).toEqual([
      'https://personal-endpoint.example/rpc',
    ])
  })
})

describe('orderFortel2RpcUrls (D38)', () => {
  it('treats loopback and localhost as loopback', () => {
    expect(isLoopbackRpcUrl('http://127.0.0.1:9545')).toBe(true)
    expect(isLoopbackRpcUrl('http://localhost:9545')).toBe(true)
    expect(isLoopbackRpcUrl('https://fortel2-sequencer-rpc.onrender.com')).toBe(
      false,
    )
  })

  it('puts a public sequencer ahead of the replica', () => {
    expect(
      orderFortel2RpcUrls(
        'https://fortel2-sequencer-rpc.onrender.com',
        'https://fortel2-replica-rpc.onrender.com',
      ),
    ).toEqual([
      'https://fortel2-sequencer-rpc.onrender.com',
      'https://fortel2-replica-rpc.onrender.com',
    ])
  })

  it('puts the replica ahead of a loopback sequencer', () => {
    expect(
      orderFortel2RpcUrls(
        'http://127.0.0.1:9545',
        'https://fortel2-replica-rpc.onrender.com',
      ),
    ).toEqual([
      'https://fortel2-replica-rpc.onrender.com',
      'http://127.0.0.1:9545',
    ])
  })

  it('keeps a lone loopback sequencer when no replica is set', () => {
    expect(orderFortel2RpcUrls('http://127.0.0.1:9545')).toEqual([
      'http://127.0.0.1:9545',
    ])
  })
})
