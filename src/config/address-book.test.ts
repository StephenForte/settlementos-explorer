import { describe, expect, it } from 'vitest'
import { lookupAddress } from './address-book'

describe('lookupAddress', () => {
  it('resolves case-insensitively', () => {
    const lower = lookupAddress(
      'base-sepolia',
      '0xff489a6d49d68f9d0b564089c545c0768a33205f',
    )
    const mixed = lookupAddress(
      'base-sepolia',
      '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
    )
    expect(lower?.label).toBe('ACME US Inc')
    expect(mixed?.entityId).toBe('ent_acme_us')
    expect(lower?.address.toLowerCase()).toBe(mixed?.address.toLowerCase())
  })

  it('returns undefined for unknown addresses', () => {
    expect(
      lookupAddress('base-sepolia', '0x0000000000000000000000000000000000000001'),
    ).toBeUndefined()
  })

  it('scopes lookup to the requested network', () => {
    const base = lookupAddress(
      'base-sepolia',
      '0xb31E5c977E468120875A384B42C482E83d999A6B',
    )
    const amoy = lookupAddress(
      'polygon-amoy',
      '0xb31E5c977E468120875A384B42C482E83d999A6B',
    )
    expect(base?.role).toBe('treasury')
    expect(amoy).toBeUndefined()
  })
})
