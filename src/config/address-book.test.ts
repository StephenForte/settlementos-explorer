import { describe, expect, it } from 'vitest'
import {
  ADDRESS_BOOK,
  BASE_SEPOLIA_DEPLOYMENT,
  ENTITIES,
  FORTEL2_SEPOLIA_DEPLOYMENT,
  PAYMENT_SETTLEMENT_ADDRESS,
  POLYGON_AMOY_DEPLOYMENT,
  SHARED_CONTRACTS,
  FORTEL2_SEPOLIA_CONTRACTS,
  TOKENIZED_MMF_ADDRESS,
  buildNetworkEntries,
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
  type AddressEntry,
  type NetworkDeployment,
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
      FORTEL2_SEPOLIA_CONTRACTS.paymentSettlement.toLowerCase(),
    )
    expect(getEscrowAddress('fortel2-sepolia')?.toLowerCase()).not.toBe(
      PAYMENT_SETTLEMENT_ADDRESS.toLowerCase(),
    )
  })
})

describe('fortel2-sepolia address book', () => {
  const EXPECTED: Record<string, { role: string; label: string }> = {
    '0x57b4a70fef917a0a3de89427f5d6654be0181f04': {
      role: 'escrow-contract',
      label: 'PaymentSettlement',
    },
    [TOKENIZED_MMF_ADDRESS.toLowerCase()]: {
      role: 'mmf-contract',
      label: 'TokenizedMMF',
    },
    // Post-re-genesis. These three hexes also appear in SHARED_CONTRACTS but
    // against *different* symbols there — the nonce shift rotated them. Read
    // the symbol, never the hex, when reasoning about which token this is.
    '0x7d7b168cfab3dba1afc41f6160e886ffe9997e63': {
      role: 'token-contract',
      label: 'mockUSDC',
    },
    '0x0b6fa033c034d694e876b56f2dd8377a2be5691d': {
      role: 'token-contract',
      label: 'mockJPY',
    },
    '0x9d8b8b7c476ab02306046f3da719d380fa0456aa': {
      role: 'token-contract',
      label: 'mockSGD',
    },
    '0x5128889f20ec13e0be38b2bebc568594159b652d': {
      role: 'operator',
      label: 'Operator',
    },
    '0x3be68c872f0fcb5d0b204eceaffff8c04f4c9e4e': {
      role: 'treasury',
      label: 'Treasury',
    },
    '0x0a32b64d50551e39a94be458de982fe9aab573d6': {
      role: 'entity',
      label: 'ACME US Inc',
    },
    '0x66f38c702711b5211abda17f1095c4e572ea7253': {
      role: 'entity',
      label: 'Tokyo Trading KK',
    },
    '0x424d3ae49bd35e238cebc7fe208aeb79a5c0ed19': {
      role: 'entity',
      label: 'Singapore Imports Pte Ltd',
    },
    '0x9a7c716f58db0478cd4735476267a7472a75c951': {
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

  it('keeps TokenizedMMF and ent_osaka_parts distinct', () => {
    // Pre-2026-08-22 these two shared a 0xAEd29 prefix, and that collision is
    // why this test exists — a prefix-matching lookup conflated them. The
    // re-genesis re-keyed both, so the collision is gone; the guard is kept
    // because the lookup must distinguish them on any future re-key too.
    const osakaAddress = '0x9A7c716F58DB0478cD4735476267A7472A75c951'
    expect(TOKENIZED_MMF_ADDRESS.toLowerCase()).not.toBe(osakaAddress.toLowerCase())

    const mmf = lookupAddress('fortel2-sepolia', TOKENIZED_MMF_ADDRESS)
    const osaka = lookupAddress('fortel2-sepolia', osakaAddress)
    expect(mmf?.role).toBe('mmf-contract')
    expect(mmf?.label).toBe('TokenizedMMF')
    expect(osaka?.role).toBe('entity')
    expect(osaka?.entityId).toBe('ent_osaka_parts')
  })
})

/** Value-level freeze of the rendered book — the refactor must not move a hex. */
function compactRow(entry: AddressEntry) {
  return {
    address: entry.address,
    role: entry.role,
    label: entry.label,
    networkId: entry.networkId,
    ...(entry.entityId ? { entityId: entry.entityId } : {}),
    ...(entry.token ? { token: entry.token } : {}),
  }
}

const PINNED_ADDRESS_BOOK = [
  {
    address: '0x9d8b8b7c476ab02306046f3da719d380fa0456aa',
    role: 'escrow-contract',
    label: 'PaymentSettlement',
    networkId: 'base-sepolia',
  },
  {
    address: '0x2066738d535681d28d0841cc2503c1c531d4d6aa',
    role: 'token-contract',
    label: 'mockUSDC',
    networkId: 'base-sepolia',
    token: {
      address: '0x2066738d535681d28d0841cc2503c1c531d4d6aa',
      decimals: 6,
      symbol: 'mockUSDC',
    },
  },
  {
    address: '0x7d7b168cfab3dba1afc41f6160e886ffe9997e63',
    role: 'token-contract',
    label: 'mockJPY',
    networkId: 'base-sepolia',
    token: {
      address: '0x7d7b168cfab3dba1afc41f6160e886ffe9997e63',
      decimals: 0,
      symbol: 'mockJPY',
    },
  },
  {
    address: '0x0b6fa033c034d694e876b56f2dd8377a2be5691d',
    role: 'token-contract',
    label: 'mockSGD',
    networkId: 'base-sepolia',
    token: {
      address: '0x0b6fa033c034d694e876b56f2dd8377a2be5691d',
      decimals: 6,
      symbol: 'mockSGD',
    },
  },
  {
    address: '0x5128889F20Ec13e0Be38b2BeBC568594159B652d',
    role: 'operator',
    label: 'Operator',
    networkId: 'base-sepolia',
  },
  {
    address: '0xb31E5c977E468120875A384B42C482E83d999A6B',
    role: 'treasury',
    label: 'Treasury',
    networkId: 'base-sepolia',
  },
  {
    address: '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
    role: 'entity',
    label: 'ACME US Inc',
    networkId: 'base-sepolia',
    entityId: 'ent_acme_us',
  },
  {
    address: '0x565C39623D473fa5e9CdeffD5AA62a66f174Aaa8',
    role: 'entity',
    label: 'Tokyo Trading KK',
    networkId: 'base-sepolia',
    entityId: 'ent_tokyo_supplier',
  },
  {
    address: '0x2E681F6B546472a1c0f1B18E6368CC7Dd5701c34',
    role: 'entity',
    label: 'Singapore Imports Pte Ltd',
    networkId: 'base-sepolia',
    entityId: 'ent_sg_supplier',
  },
  {
    address: '0x1bF1621b2C094aaBF700E599BEb90586E4B847Bc',
    role: 'entity',
    label: 'Osaka Parts Co',
    networkId: 'base-sepolia',
    entityId: 'ent_osaka_parts',
  },
  {
    address: '0x9d8b8b7c476ab02306046f3da719d380fa0456aa',
    role: 'escrow-contract',
    label: 'PaymentSettlement',
    networkId: 'polygon-amoy',
  },
  {
    address: '0x2066738d535681d28d0841cc2503c1c531d4d6aa',
    role: 'token-contract',
    label: 'mockUSDC',
    networkId: 'polygon-amoy',
    token: {
      address: '0x2066738d535681d28d0841cc2503c1c531d4d6aa',
      decimals: 6,
      symbol: 'mockUSDC',
    },
  },
  {
    address: '0x7d7b168cfab3dba1afc41f6160e886ffe9997e63',
    role: 'token-contract',
    label: 'mockJPY',
    networkId: 'polygon-amoy',
    token: {
      address: '0x7d7b168cfab3dba1afc41f6160e886ffe9997e63',
      decimals: 0,
      symbol: 'mockJPY',
    },
  },
  {
    address: '0x0b6fa033c034d694e876b56f2dd8377a2be5691d',
    role: 'token-contract',
    label: 'mockSGD',
    networkId: 'polygon-amoy',
    token: {
      address: '0x0b6fa033c034d694e876b56f2dd8377a2be5691d',
      decimals: 6,
      symbol: 'mockSGD',
    },
  },
  {
    address: '0x5128889F20Ec13e0Be38b2BeBC568594159B652d',
    role: 'operator',
    label: 'Operator',
    networkId: 'polygon-amoy',
  },
  {
    address: '0x458b3e99D534cacd8Bfd2f0A73B280135C6FAD56',
    role: 'treasury',
    label: 'Treasury',
    networkId: 'polygon-amoy',
  },
  {
    address: '0xBeaF3a16dbEA011336a6C609C893F8A386eD0312',
    role: 'entity',
    label: 'ACME US Inc',
    networkId: 'polygon-amoy',
    entityId: 'ent_acme_us',
  },
  {
    address: '0x4605e2CD9f232B377588a5C8491a19FAf7303C6a',
    role: 'entity',
    label: 'Tokyo Trading KK',
    networkId: 'polygon-amoy',
    entityId: 'ent_tokyo_supplier',
  },
  {
    address: '0xA0A8a6e7165bADabA3a256fD2cA8316689F1D98F',
    role: 'entity',
    label: 'Singapore Imports Pte Ltd',
    networkId: 'polygon-amoy',
    entityId: 'ent_sg_supplier',
  },
  {
    address: '0xe8BE2e1E665365A3f9834B8d63d0C393378525a6',
    role: 'entity',
    label: 'Osaka Parts Co',
    networkId: 'polygon-amoy',
    entityId: 'ent_osaka_parts',
  },
  {
    address: '0x57b4a70fef917a0a3de89427f5d6654be0181f04',
    role: 'escrow-contract',
    label: 'PaymentSettlement',
    networkId: 'fortel2-sepolia',
  },
  {
    address: '0x24f439f535e1484e1be044d8b079774f6dacb6c9',
    role: 'mmf-contract',
    label: 'TokenizedMMF',
    networkId: 'fortel2-sepolia',
  },
  {
    address: '0x7d7b168cfab3dba1afc41f6160e886ffe9997e63',
    role: 'token-contract',
    label: 'mockUSDC',
    networkId: 'fortel2-sepolia',
    token: {
      address: '0x7d7b168cfab3dba1afc41f6160e886ffe9997e63',
      decimals: 6,
      symbol: 'mockUSDC',
    },
  },
  {
    address: '0x0b6fa033c034d694e876b56f2dd8377a2be5691d',
    role: 'token-contract',
    label: 'mockJPY',
    networkId: 'fortel2-sepolia',
    token: {
      address: '0x0b6fa033c034d694e876b56f2dd8377a2be5691d',
      decimals: 0,
      symbol: 'mockJPY',
    },
  },
  {
    address: '0x9d8b8b7c476ab02306046f3da719d380fa0456aa',
    role: 'token-contract',
    label: 'mockSGD',
    networkId: 'fortel2-sepolia',
    token: {
      address: '0x9d8b8b7c476ab02306046f3da719d380fa0456aa',
      decimals: 6,
      symbol: 'mockSGD',
    },
  },
  {
    address: '0x5128889F20Ec13e0Be38b2BeBC568594159B652d',
    role: 'operator',
    label: 'Operator',
    networkId: 'fortel2-sepolia',
  },
  {
    address: '0x3bE68C872f0FCB5d0b204eCeAFFff8C04F4c9E4E',
    role: 'treasury',
    label: 'Treasury',
    networkId: 'fortel2-sepolia',
  },
  {
    address: '0x0A32b64D50551E39a94Be458DE982fE9Aab573D6',
    role: 'entity',
    label: 'ACME US Inc',
    networkId: 'fortel2-sepolia',
    entityId: 'ent_acme_us',
  },
  {
    address: '0x66F38C702711B5211ABdA17F1095C4e572Ea7253',
    role: 'entity',
    label: 'Tokyo Trading KK',
    networkId: 'fortel2-sepolia',
    entityId: 'ent_tokyo_supplier',
  },
  {
    address: '0x424d3ae49bD35E238CEbC7fE208AeB79A5c0eD19',
    role: 'entity',
    label: 'Singapore Imports Pte Ltd',
    networkId: 'fortel2-sepolia',
    entityId: 'ent_sg_supplier',
  },
  {
    address: '0x9A7c716F58DB0478cD4735476267A7472A75c951',
    role: 'entity',
    label: 'Osaka Parts Co',
    networkId: 'fortel2-sepolia',
    entityId: 'ent_osaka_parts',
  },
] as const

describe('address-book re-key structure (D31)', () => {
  it('renders ADDRESS_BOOK unchanged in value terms (order, roles, labels, hexes)', () => {
    expect(ADDRESS_BOOK.map(compactRow)).toEqual([...PINNED_ADDRESS_BOOK])
  })

  it('expresses cross-network sharing as an alias of SHARED_CONTRACTS, not a copy', () => {
    expect(BASE_SEPOLIA_DEPLOYMENT.contracts).toBe(SHARED_CONTRACTS)
    expect(POLYGON_AMOY_DEPLOYMENT.contracts).toBe(SHARED_CONTRACTS)
    // ForteL2 diverged in the 2026-08-22 re-genesis and must not re-alias:
    // doing so would silently relabel chain 852 with Base Sepolia's hexes.
    expect(FORTEL2_SEPOLIA_DEPLOYMENT.contracts).not.toBe(SHARED_CONTRACTS)
  })

  it('lets ForteL2 take a distinct escrow without rewriting Base or Amoy', () => {
    const divergentEscrow = '0x0000000000000000000000000000000000000001'
    const divergent: NetworkDeployment = {
      ...FORTEL2_SEPOLIA_DEPLOYMENT,
      contracts: {
        ...SHARED_CONTRACTS,
        tokens: { ...SHARED_CONTRACTS.tokens },
        paymentSettlement: divergentEscrow,
      },
    }

    const forte = buildNetworkEntries(divergent)
    const base = buildNetworkEntries(BASE_SEPOLIA_DEPLOYMENT)
    const amoy = buildNetworkEntries(POLYGON_AMOY_DEPLOYMENT)

    expect(forte.find((e) => e.role === 'escrow-contract')?.address).toBe(
      divergentEscrow,
    )
    expect(base.find((e) => e.role === 'escrow-contract')?.address).toBe(
      PAYMENT_SETTLEMENT_ADDRESS,
    )
    expect(amoy.find((e) => e.role === 'escrow-contract')?.address).toBe(
      PAYMENT_SETTLEMENT_ADDRESS,
    )
    expect(getEscrowAddress('base-sepolia')?.toLowerCase()).toBe(
      PAYMENT_SETTLEMENT_ADDRESS.toLowerCase(),
    )
    expect(getEscrowAddress('polygon-amoy')?.toLowerCase()).toBe(
      PAYMENT_SETTLEMENT_ADDRESS.toLowerCase(),
    )
    expect(getEscrowAddress('fortel2-sepolia')?.toLowerCase()).toBe(
      FORTEL2_SEPOLIA_CONTRACTS.paymentSettlement.toLowerCase(),
    )
    expect(getEscrowAddress('fortel2-sepolia')?.toLowerCase()).not.toBe(
      PAYMENT_SETTLEMENT_ADDRESS.toLowerCase(),
    )
  })

  it('omitting tokenizedMmf drops only the mmf-contract row', () => {
    const withoutFund: NetworkDeployment = {
      networkId: FORTEL2_SEPOLIA_DEPLOYMENT.networkId,
      contracts: FORTEL2_SEPOLIA_DEPLOYMENT.contracts,
      treasury: FORTEL2_SEPOLIA_DEPLOYMENT.treasury,
      entities: FORTEL2_SEPOLIA_DEPLOYMENT.entities,
    }
    const rows = buildNetworkEntries(withoutFund)
    expect(rows.find((e) => e.role === 'mmf-contract')).toBeUndefined()
    expect(rows).toHaveLength(10)
    expect(rows.map((e) => e.role)).toEqual([
      'escrow-contract',
      'token-contract',
      'token-contract',
      'token-contract',
      'operator',
      'treasury',
      'entity',
      'entity',
      'entity',
      'entity',
    ])
  })
})
