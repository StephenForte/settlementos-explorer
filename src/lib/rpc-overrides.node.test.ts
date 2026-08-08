/**
 * @vitest-environment node
 *
 * MCP server imports getBalances → getPublicClient → rpc-overrides.
 * A bare localStorage access on that chain takes out Node. This file runs
 * without jsdom's localStorage.
 */
import { describe, expect, it } from 'vitest'
import { getPublicClient, resolveRpcUrls } from './clients'
import {
  getRpcOverride,
  setRpcOverride,
  validateRpcOverrideUrl,
} from './rpc-overrides'

describe('Node path (no localStorage)', () => {
  it('rpc-overrides and getPublicClient import and run without localStorage', () => {
    expect(typeof localStorage).toBe('undefined')
    expect(getRpcOverride('polygon-amoy')).toBeUndefined()
    expect(setRpcOverride('polygon-amoy', 'https://example.com/rpc').ok).toBe(
      true,
    )
    // Persist is a no-op without storage; reads stay empty.
    expect(getRpcOverride('polygon-amoy')).toBeUndefined()
    expect(resolveRpcUrls('polygon-amoy').length).toBeGreaterThan(0)
    expect(() => getPublicClient('base-sepolia')).not.toThrow()
    expect(validateRpcOverrideUrl('https://ok.example').ok).toBe(true)
  })
})
