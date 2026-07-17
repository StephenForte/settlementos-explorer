import { describe, expect, it } from 'vitest'
import {
  ENTITIES,
  getAddressesForNetwork,
  getEntity,
  getEntityWallets,
  getTokens,
  isEntityId,
  labelForAddress,
  lookupAddress,
  lookupToken,
  roleGroup,
  roleLabel,
  truncateAddress,
} from './address-book'

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

describe('tokens and entities', () => {
  it('exposes mock tokens with correct decimals on both networks', () => {
    for (const networkId of ['base-sepolia', 'polygon-amoy'] as const) {
      const tokens = getTokens(networkId)
      expect(tokens.map((t) => t.symbol).sort()).toEqual([
        'mockJPY',
        'mockSGD',
        'mockUSDC',
      ])
      expect(tokens.find((t) => t.symbol === 'mockJPY')?.decimals).toBe(0)
      expect(tokens.find((t) => t.symbol === 'mockUSDC')?.decimals).toBe(6)
    }
  })

  it('looks up tokens by address', () => {
    const token = lookupToken(
      'base-sepolia',
      '0x7d7b168cfab3dba1afc41f6160e886ffe9997e63',
    )
    expect(token?.symbol).toBe('mockJPY')
  })

  it('links the same entity across networks with different wallets', () => {
    expect(ENTITIES).toHaveLength(4)
    expect(isEntityId('ent_tokyo_supplier')).toBe(true)
    expect(isEntityId('ent_unknown')).toBe(false)
    expect(getEntity('ent_tokyo_supplier')?.displayName).toBe('Tokyo Trading KK')

    const wallets = getEntityWallets('ent_acme_us')
    expect(wallets).toHaveLength(2)
    expect(new Set(wallets.map((w) => w.networkId)).size).toBe(2)
    expect(wallets[0]!.address.toLowerCase()).not.toBe(
      wallets[1]!.address.toLowerCase(),
    )
  })

  it('groups roles for the directory', () => {
    expect(roleGroup('escrow-contract')).toBe('Contracts')
    expect(roleGroup('operator')).toBe('Platform')
    expect(roleGroup('entity')).toBe('Entities')
    expect(roleLabel('treasury')).toBe('Treasury')
  })

  it('lists known addresses per network without private keys', () => {
    const base = getAddressesForNetwork('base-sepolia')
    expect(base.length).toBeGreaterThanOrEqual(9)
    expect(JSON.stringify(base)).not.toMatch(/privateKey/i)
  })

  it('labels known addresses and truncates unknowns', () => {
    expect(
      labelForAddress(
        'base-sepolia',
        '0x9d8b8b7c476ab02306046f3da719d380fa0456aa',
      ),
    ).toBe('PaymentSettlement')
    expect(truncateAddress('0x5128889F20Ec13e0Be38b2BeBC568594159B652d')).toMatch(
      /^0x5128…/,
    )
  })
})
