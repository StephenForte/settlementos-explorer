import { describe, expect, it } from 'vitest'
import {
  ENTITIES,
  PAYMENT_SETTLEMENT_ADDRESS,
  TOKENIZED_MMF_ADDRESS,
  filterAddressEntries,
  getAddressesForNetwork,
  getEntity,
  getEntityWallets,
  getEscrowAddress,
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
  it('exposes mock tokens with correct decimals on all networks', () => {
    for (const networkId of [
      'base-sepolia',
      'polygon-amoy',
      'fortel2-sepolia',
    ] as const) {
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
    expect(wallets).toHaveLength(3)
    expect(new Set(wallets.map((w) => w.networkId)).size).toBe(3)
    expect(wallets[0]!.address.toLowerCase()).not.toBe(
      wallets[1]!.address.toLowerCase(),
    )
  })

  it('groups roles for the directory', () => {
    expect(roleGroup('escrow-contract')).toBe('Contracts')
    expect(roleGroup('mmf-contract')).toBe('Contracts')
    expect(roleGroup('operator')).toBe('Platform')
    expect(roleGroup('entity')).toBe('Entities')
    expect(roleLabel('treasury')).toBe('Treasury')
    expect(roleLabel('mmf-contract')).toBe('Tokenized MMF')
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

  it('filters directory entries by label, role, or address fragment', () => {
    const base = getAddressesForNetwork('base-sepolia')
    expect(filterAddressEntries(base, 'acme').every((e) =>
      e.label.toLowerCase().includes('acme'),
    )).toBe(true)
    expect(filterAddressEntries(base, 'operator')).toHaveLength(1)
    expect(
      filterAddressEntries(base, PAYMENT_SETTLEMENT_ADDRESS.slice(2, 10)).some(
        (e) => e.role === 'escrow-contract',
      ),
    ).toBe(true)
    expect(filterAddressEntries(base, '   ')).toHaveLength(base.length)
  })

  it('resolves escrow address from the address book', () => {
    expect(getEscrowAddress('base-sepolia')?.toLowerCase()).toBe(
      PAYMENT_SETTLEMENT_ADDRESS.toLowerCase(),
    )
    expect(getEscrowAddress('polygon-amoy')?.toLowerCase()).toBe(
      PAYMENT_SETTLEMENT_ADDRESS.toLowerCase(),
    )
    expect(getEscrowAddress('fortel2-sepolia')?.toLowerCase()).toBe(
      PAYMENT_SETTLEMENT_ADDRESS.toLowerCase(),
    )
  })
})

describe('fortel2-sepolia address book', () => {
  const EXPECTED: Record<string, { role: string; label: string }> = {
    '0x9d8b8b7c476ab02306046f3da719d380fa0456aa': {
      role: 'escrow-contract',
      label: 'PaymentSettlement',
    },
    [TOKENIZED_MMF_ADDRESS.toLowerCase()]: {
      role: 'mmf-contract',
      label: 'TokenizedMMF',
    },
    '0x2066738d535681d28d0841cc2503c1c531d4d6aa': {
      role: 'token-contract',
      label: 'mockUSDC',
    },
    '0x7d7b168cfab3dba1afc41f6160e886ffe9997e63': {
      role: 'token-contract',
      label: 'mockJPY',
    },
    '0x0b6fa033c034d694e876b56f2dd8377a2be5691d': {
      role: 'token-contract',
      label: 'mockSGD',
    },
    '0x5128889f20ec13e0be38b2bebc568594159b652d': {
      role: 'operator',
      label: 'Operator',
    },
    '0x1e4ee7a078bd40d1982df1978c046f8cd0d1d3aa': {
      role: 'treasury',
      label: 'Treasury',
    },
    '0xf7842ac33aff3dd3a6b195dd366e7730771ebe5d': {
      role: 'entity',
      label: 'ACME US Inc',
    },
    '0x9e024aa6dc77d4cab4c0ad5324ec2b2af43dc116': {
      role: 'entity',
      label: 'Tokyo Trading KK',
    },
    '0x15ceb06dae813d2223992c7a40ca0f1f6678b5b0': {
      role: 'entity',
      label: 'Singapore Imports Pte Ltd',
    },
    '0xaed29ca4b33504302bda683b99072129432d7797': {
      role: 'entity',
      label: 'Osaka Parts Co',
    },
  }

  it('lists exactly eleven verified public addresses', () => {
    const fortel2 = getAddressesForNetwork('fortel2-sepolia')
    expect(fortel2).toHaveLength(11)

    for (const entry of fortel2) {
      const expected = EXPECTED[entry.address.toLowerCase()]
      expect(expected, entry.address).toBeDefined()
      expect(entry.role).toBe(expected!.role)
      expect(entry.label).toBe(expected!.label)
    }

    expect(Object.keys(EXPECTED)).toHaveLength(11)
  })

  it('keeps TokenizedMMF and ent_osaka_parts distinct despite shared 0xAEd29 prefix', () => {
    const osakaAddress = '0xAEd29CA4b33504302bda683B99072129432D7797'
    expect(TOKENIZED_MMF_ADDRESS.toLowerCase()).not.toBe(osakaAddress.toLowerCase())
    expect(TOKENIZED_MMF_ADDRESS.slice(0, 7).toLowerCase()).toBe('0xaed29')
    expect(osakaAddress.slice(0, 7).toLowerCase()).toBe('0xaed29')

    const mmf = lookupAddress('fortel2-sepolia', TOKENIZED_MMF_ADDRESS)
    const osaka = lookupAddress('fortel2-sepolia', osakaAddress)
    expect(mmf?.role).toBe('mmf-contract')
    expect(mmf?.label).toBe('TokenizedMMF')
    expect(osaka?.role).toBe('entity')
    expect(osaka?.entityId).toBe('ent_osaka_parts')
  })
})
