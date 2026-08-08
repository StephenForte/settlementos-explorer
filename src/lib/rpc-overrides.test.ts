import { afterEach, describe, expect, it } from 'vitest'
import {
  RPC_OVERRIDE_STORAGE_KEY,
  clearRpcOverride,
  getAllRpcOverrides,
  getRpcOverride,
  setRpcOverride,
  validateRpcOverrideUrl,
} from './rpc-overrides'

afterEach(() => {
  localStorage.removeItem(RPC_OVERRIDE_STORAGE_KEY)
})

describe('validateRpcOverrideUrl', () => {
  it('accepts http and https URLs', () => {
    expect(validateRpcOverrideUrl('https://polygon-amoy.drpc.org')).toEqual({
      ok: true,
      url: 'https://polygon-amoy.drpc.org',
    })
    expect(validateRpcOverrideUrl('  http://127.0.0.1:9545  ')).toEqual({
      ok: true,
      url: 'http://127.0.0.1:9545',
    })
  })

  it('rejects non-HTTP schemes and bare hostnames', () => {
    for (const raw of [
      'javascript:alert(1)',
      'data:text/plain,hi',
      'file:///etc/passwd',
      'polygon-amoy.drpc.org',
      '',
      '   ',
    ]) {
      expect(validateRpcOverrideUrl(raw).ok).toBe(false)
    }
  })
})

describe('rpc override storage', () => {
  it('persists per-network and isolates networks', () => {
    expect(setRpcOverride('polygon-amoy', 'https://amoy.example/rpc').ok).toBe(
      true,
    )
    expect(getRpcOverride('polygon-amoy')).toBe('https://amoy.example/rpc')
    expect(getRpcOverride('base-sepolia')).toBeUndefined()
    expect(getRpcOverride('fortel2-sepolia')).toBeUndefined()

    expect(
      setRpcOverride('base-sepolia', 'https://base.example/rpc').ok,
    ).toBe(true)
    expect(getRpcOverride('polygon-amoy')).toBe('https://amoy.example/rpc')
    expect(getRpcOverride('base-sepolia')).toBe('https://base.example/rpc')
  })

  it('clearing restores undefined for that network only', () => {
    setRpcOverride('polygon-amoy', 'https://amoy.example/rpc')
    setRpcOverride('base-sepolia', 'https://base.example/rpc')
    clearRpcOverride('polygon-amoy')
    expect(getRpcOverride('polygon-amoy')).toBeUndefined()
    expect(getRpcOverride('base-sepolia')).toBe('https://base.example/rpc')
    expect(getAllRpcOverrides()).toEqual({
      'base-sepolia': 'https://base.example/rpc',
    })
  })

  it('refuses to persist an invalid URL', () => {
    expect(setRpcOverride('polygon-amoy', 'javascript:void(0)').ok).toBe(false)
    expect(getRpcOverride('polygon-amoy')).toBeUndefined()
    expect(localStorage.getItem(RPC_OVERRIDE_STORAGE_KEY)).toBeNull()
  })
})
