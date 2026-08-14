import type { NetworkId } from './networks'

export type AddressRole =
  | 'escrow-contract'
  | 'mmf-contract'
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

/**
 * Per-network contract set. Sharing across networks is expressed by aliasing
 * the same object (see SHARED_CONTRACTS), not by a module-level constant that
 * every network is forced to read. ForteL2 can take a distinct object without
 * touching Base Sepolia or Polygon Amoy.
 */
export interface NetworkContracts {
  paymentSettlement: string
  tokens: {
    mockUSDC: TokenMeta
    mockJPY: TokenMeta
    mockSGD: TokenMeta
  }
  operator: string
}

/** Self-contained per-network address book. ForteL2 re-key replaces this block. */
export interface NetworkDeployment {
  networkId: NetworkId
  contracts: NetworkContracts
  treasury: string
  entities: Record<EntityId, string>
  /** ForteL2 only today. Omit when the post-wipe deploy has no fund. */
  tokenizedMmf?: string
}

/**
 * CREATE addresses currently shared across Base Sepolia, Polygon Amoy, and
 * ForteL2 Sepolia (same deployer, same nonce sequence). Networks that still
 * share alias this object. To diverge ForteL2, assign it a *new* contracts
 * object — do not edit this one, or Base and Amoy change with it.
 */
export const SHARED_CONTRACTS: NetworkContracts = {
  paymentSettlement: '0x9d8b8b7c476ab02306046f3da719d380fa0456aa',
  tokens: {
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
  },
  operator: '0x5128889F20Ec13e0Be38b2BeBC568594159B652d',
}

/** Current shared PaymentSettlement CREATE address. Look up per network via getEscrowAddress. */
export const PAYMENT_SETTLEMENT_ADDRESS =
  SHARED_CONTRACTS.paymentSettlement

/** TokenizedMMF on ForteL2 Sepolia only (Base / Amoy have no fund deployed). */
export const TOKENIZED_MMF_ADDRESS =
  '0xaed29387417dad9ab1993332e2c2b99d35ffe7ff'

export const BASE_SEPOLIA_DEPLOYMENT: NetworkDeployment = {
  networkId: 'base-sepolia',
  contracts: SHARED_CONTRACTS,
  treasury: '0xb31E5c977E468120875A384B42C482E83d999A6B',
  entities: {
    ent_acme_us: '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
    ent_tokyo_supplier: '0x565C39623D473fa5e9CdeffD5AA62a66f174Aaa8',
    ent_sg_supplier: '0x2E681F6B546472a1c0f1B18E6368CC7Dd5701c34',
    ent_osaka_parts: '0x1bF1621b2C094aaBF700E599BEb90586E4B847Bc',
  },
}

export const POLYGON_AMOY_DEPLOYMENT: NetworkDeployment = {
  networkId: 'polygon-amoy',
  contracts: SHARED_CONTRACTS,
  treasury: '0x458b3e99D534cacd8Bfd2f0A73B280135C6FAD56',
  entities: {
    ent_acme_us: '0xBeaF3a16dbEA011336a6C609C893F8A386eD0312',
    ent_tokyo_supplier: '0x4605e2CD9f232B377588a5C8491a19FAf7303C6a',
    ent_sg_supplier: '0xA0A8a6e7165bADabA3a256fD2cA8316689F1D98F',
    ent_osaka_parts: '0xe8BE2e1E665365A3f9834B8d63d0C393378525a6',
  },
}

/**
 * ForteL2 Sepolia as one block. Re-key by replacing this object.
 * `contracts: SHARED_CONTRACTS` is a statement about the current deploy,
 * not a requirement the module cannot represent otherwise.
 */
export const FORTEL2_SEPOLIA_DEPLOYMENT: NetworkDeployment = {
  networkId: 'fortel2-sepolia',
  contracts: SHARED_CONTRACTS,
  tokenizedMmf: TOKENIZED_MMF_ADDRESS,
  treasury: '0x1E4ee7a078Bd40d1982dF1978C046f8cD0D1D3AA',
  entities: {
    ent_acme_us: '0xF7842ac33AFF3dD3a6b195Dd366e7730771EBE5d',
    ent_tokyo_supplier: '0x9E024AA6dc77d4cAB4c0AD5324ec2B2Af43dc116',
    ent_sg_supplier: '0x15ceB06dAe813d2223992c7a40cA0F1f6678b5b0',
    ent_osaka_parts: '0xAEd29CA4b33504302bda683B99072129432D7797',
  },
}

function tokenEntries(
  networkId: NetworkId,
  tokens: NetworkContracts['tokens'],
): AddressEntry[] {
  return Object.values(tokens).map((token) => ({
    address: token.address,
    role: 'token-contract' as const,
    label: token.symbol,
    networkId,
    token: { ...token },
  }))
}

export function buildNetworkEntries(book: NetworkDeployment): AddressEntry[] {
  const { networkId, contracts, treasury, entities, tokenizedMmf } = book
  const entries: AddressEntry[] = [
    {
      address: contracts.paymentSettlement,
      role: 'escrow-contract',
      label: 'PaymentSettlement',
      networkId,
    },
  ]
  if (tokenizedMmf) {
    entries.push({
      address: tokenizedMmf,
      role: 'mmf-contract',
      label: 'TokenizedMMF',
      networkId,
    })
  }
  entries.push(
    ...tokenEntries(networkId, contracts.tokens),
    {
      address: contracts.operator,
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
  )
  return entries
}

export const ADDRESS_BOOK: AddressEntry[] = [
  ...buildNetworkEntries(BASE_SEPOLIA_DEPLOYMENT),
  ...buildNetworkEntries(POLYGON_AMOY_DEPLOYMENT),
  ...buildNetworkEntries(FORTEL2_SEPOLIA_DEPLOYMENT),
]

/** Tokens known on a network (ForteL2 currently aliases SHARED_CONTRACTS; it may diverge). */
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
  if (
    role === 'escrow-contract' ||
    role === 'mmf-contract' ||
    role === 'token-contract'
  ) {
    return 'Contracts'
  }
  if (role === 'operator' || role === 'treasury') return 'Platform'
  return 'Entities'
}

export function roleLabel(role: AddressRole): string {
  switch (role) {
    case 'escrow-contract':
      return 'Escrow'
    case 'mmf-contract':
      return 'Tokenized MMF'
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
