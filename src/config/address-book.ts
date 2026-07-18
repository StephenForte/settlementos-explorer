import type { NetworkId } from './networks'

export type AddressRole =
  | 'escrow-contract'
  | 'token-contract'
  | 'operator'
  | 'treasury'
  | 'entity'

export type EntityId =
  | 'ent_acme_us'
  | 'ent_tokyo_supplier'
  | 'ent_sg_supplier'
  | 'ent_osaka_parts'

export interface TokenMeta {
  symbol: string
  decimals: number
  address: string
}

export interface AddressEntry {
  address: string
  role: AddressRole
  label: string
  networkId: NetworkId
  /** Present when role === 'entity' */
  entityId?: EntityId
  /** Present when role === 'token-contract' */
  token?: TokenMeta
}

export interface EntityMeta {
  entityId: EntityId
  displayName: string
}

/**
 * Public addresses only — copied from SettlementOS chain/deployments.*.json.
 * Private keys must never enter this repository.
 */
export const ENTITIES: EntityMeta[] = [
  { entityId: 'ent_acme_us', displayName: 'ACME US Inc' },
  { entityId: 'ent_tokyo_supplier', displayName: 'Tokyo Trading KK' },
  { entityId: 'ent_sg_supplier', displayName: 'Singapore Imports Pte Ltd' },
  { entityId: 'ent_osaka_parts', displayName: 'Osaka Parts Co' },
]

const SHARED_TOKENS = {
  mockUSDC: {
    address: '0x2066738d535681d28d0841cc2503c1c531d4d6aa',
    decimals: 6,
    symbol: 'mockUSDC',
  },
  mockJPY: {
    address: '0x7d7b168cfab3dba1afc41f6160e886ffe9997e63',
    decimals: 0,
    symbol: 'mockJPY',
  },
  mockSGD: {
    address: '0x0b6fa033c034d694e876b56f2dd8377a2be5691d',
    decimals: 6,
    symbol: 'mockSGD',
  },
} as const

/** Shared PaymentSettlement address on both testnets. */
export const PAYMENT_SETTLEMENT_ADDRESS =
  '0x9d8b8b7c476ab02306046f3da719d380fa0456aa'
const OPERATOR = '0x5128889F20Ec13e0Be38b2BeBC568594159B652d'

function tokenEntries(networkId: NetworkId): AddressEntry[] {
  return Object.values(SHARED_TOKENS).map((token) => ({
    address: token.address,
    role: 'token-contract' as const,
    label: token.symbol,
    networkId,
    token: { ...token },
  }))
}

function networkEntries(
  networkId: NetworkId,
  treasury: string,
  entities: Record<EntityId, string>,
): AddressEntry[] {
  return [
    {
      address: PAYMENT_SETTLEMENT_ADDRESS,
      role: 'escrow-contract',
      label: 'PaymentSettlement',
      networkId,
    },
    ...tokenEntries(networkId),
    {
      address: OPERATOR,
      role: 'operator',
      label: 'Operator',
      networkId,
    },
    {
      address: treasury,
      role: 'treasury',
      label: 'Treasury',
      networkId,
    },
    {
      address: entities.ent_acme_us,
      role: 'entity',
      label: 'ACME US Inc',
      networkId,
      entityId: 'ent_acme_us',
    },
    {
      address: entities.ent_tokyo_supplier,
      role: 'entity',
      label: 'Tokyo Trading KK',
      networkId,
      entityId: 'ent_tokyo_supplier',
    },
    {
      address: entities.ent_sg_supplier,
      role: 'entity',
      label: 'Singapore Imports Pte Ltd',
      networkId,
      entityId: 'ent_sg_supplier',
    },
    {
      address: entities.ent_osaka_parts,
      role: 'entity',
      label: 'Osaka Parts Co',
      networkId,
      entityId: 'ent_osaka_parts',
    },
  ]
}

export const ADDRESS_BOOK: AddressEntry[] = [
  ...networkEntries('base-sepolia', '0xb31E5c977E468120875A384B42C482E83d999A6B', {
    ent_acme_us: '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
    ent_tokyo_supplier: '0x565C39623D473fa5e9CdeffD5AA62a66f174Aaa8',
    ent_sg_supplier: '0x2E681F6B546472a1c0f1B18E6368CC7Dd5701c34',
    ent_osaka_parts: '0x1bF1621b2C094aaBF700E599BEb90586E4B847Bc',
  }),
  ...networkEntries('polygon-amoy', '0x458b3e99D534cacd8Bfd2f0A73B280135C6FAD56', {
    ent_acme_us: '0xBeaF3a16dbEA011336a6C609C893F8A386eD0312',
    ent_tokyo_supplier: '0x4605e2CD9f232B377588a5C8491a19FAf7303C6a',
    ent_sg_supplier: '0xA0A8a6e7165bADabA3a256fD2cA8316689F1D98F',
    ent_osaka_parts: '0xe8BE2e1E665365A3f9834B8d63d0C393378525a6',
  }),
]

/** Tokens known on a network (same addresses on both testnets). */
export function getTokens(networkId: NetworkId): TokenMeta[] {
  return ADDRESS_BOOK.filter(
    (e): e is AddressEntry & { token: TokenMeta } =>
      e.networkId === networkId && e.role === 'token-contract' && e.token != null,
  ).map((e) => e.token)
}

export function getAddressesForNetwork(networkId: NetworkId): AddressEntry[] {
  return ADDRESS_BOOK.filter((e) => e.networkId === networkId)
}

/** Case-insensitive label / address / role / entity filter for the directory. */
export function filterAddressEntries(
  entries: AddressEntry[],
  query: string,
): AddressEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return entries
  return entries.filter((entry) => {
    const haystack = [
      entry.label,
      entry.address,
      entry.role,
      roleLabel(entry.role),
      roleGroup(entry.role),
      entry.entityId ?? '',
      entry.token?.symbol ?? '',
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  })
}

export function getEscrowAddress(networkId: NetworkId): string | undefined {
  return ADDRESS_BOOK.find(
    (e) => e.networkId === networkId && e.role === 'escrow-contract',
  )?.address
}

export function lookupAddress(
  networkId: NetworkId,
  address: string,
): AddressEntry | undefined {
  const needle = address.toLowerCase()
  return ADDRESS_BOOK.find(
    (e) => e.networkId === networkId && e.address.toLowerCase() === needle,
  )
}

export function lookupToken(
  networkId: NetworkId,
  tokenAddress: string,
): TokenMeta | undefined {
  const entry = lookupAddress(networkId, tokenAddress)
  return entry?.token
}

export function getEntity(entityId: EntityId): EntityMeta | undefined {
  return ENTITIES.find((e) => e.entityId === entityId)
}

export function getEntityWallets(entityId: EntityId): AddressEntry[] {
  return ADDRESS_BOOK.filter((e) => e.entityId === entityId)
}

export function isEntityId(value: string): value is EntityId {
  return ENTITIES.some((e) => e.entityId === value)
}

export function truncateAddress(address: string, chars = 4): string {
  if (address.length < chars * 2 + 2) return address
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`
}

export function labelForAddress(networkId: NetworkId, address: string): string {
  return lookupAddress(networkId, address)?.label ?? truncateAddress(address)
}

export const ROLE_GROUP_ORDER = ['Contracts', 'Platform', 'Entities'] as const

export type RoleGroup = (typeof ROLE_GROUP_ORDER)[number]

export function roleGroup(role: AddressRole): RoleGroup {
  if (role === 'escrow-contract' || role === 'token-contract') return 'Contracts'
  if (role === 'operator' || role === 'treasury') return 'Platform'
  return 'Entities'
}

export function roleLabel(role: AddressRole): string {
  switch (role) {
    case 'escrow-contract':
      return 'Escrow'
    case 'token-contract':
      return 'Token'
    case 'operator':
      return 'Operator'
    case 'treasury':
      return 'Treasury'
    case 'entity':
      return 'Entity'
  }
}
