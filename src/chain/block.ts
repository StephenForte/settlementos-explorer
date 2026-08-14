import {
  BlockNotFoundError,
  isHash,
  type Address,
  type Hash,
} from 'viem'
import { type NetworkId } from '../config/networks'
import { cached } from '../lib/cache'
import { getPublicClient } from '../lib/clients'

export type ParsedBlockId =
  | { kind: 'number'; canonical: string; number: bigint }
  | { kind: 'hash'; canonical: string; hash: Hash }

export interface BlockTxRow {
  hash: Hash
  from: Address
  to: Address | null
  value: bigint
  /** viem leaves OP-stack deposit txs with `type: undefined`. */
  type: string | undefined
}

interface BlockShared {
  networkId: NetworkId
  queried: string
}

export interface InvalidBlockLookup {
  status: 'invalid'
  queried: string
}

export interface NotFoundBlockLookup extends BlockShared {
  status: 'not_found'
}

export interface FoundBlockLookup extends BlockShared {
  status: 'found'
  number: bigint
  hash: Hash
  parentHash: Hash
  timestamp: number
  gasUsed: bigint
  gasLimit: bigint
  baseFeePerGas: bigint | null
  miner: Address
  transactions: BlockTxRow[]
  head: bigint
}

export type BlockLookup =
  | InvalidBlockLookup
  | NotFoundBlockLookup
  | FoundBlockLookup

/**
 * Accept a decimal block number or a 0x-prefixed 32-byte hash.
 * Anything else is malformed and must never reach the RPC.
 */
export function parseBlockId(value: string): ParsedBlockId | null {
  if (/^\d+$/.test(value)) {
    const number = BigInt(value)
    return { kind: 'number', canonical: number.toString(), number }
  }
  const normalised = value.toLowerCase()
  if (isHash(normalised)) {
    return { kind: 'hash', canonical: normalised, hash: normalised }
  }
  return null
}

function toTxRow(tx: {
  hash: Hash
  from: Address
  to: Address | null
  value: bigint
  type?: string | null
}): BlockTxRow {
  return {
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    value: tx.value,
    type: typeof tx.type === 'string' ? tx.type : undefined,
  }
}

async function fetchBlockDetail(
  networkId: NetworkId,
  parsed: ParsedBlockId,
): Promise<BlockLookup> {
  const client = getPublicClient(networkId)

  let block
  try {
    block =
      parsed.kind === 'number'
        ? await client.getBlock({
            blockNumber: parsed.number,
            includeTransactions: true,
          })
        : await client.getBlock({
            blockHash: parsed.hash,
            includeTransactions: true,
          })
  } catch (err) {
    if (err instanceof BlockNotFoundError) {
      return { status: 'not_found', networkId, queried: parsed.canonical }
    }
    throw err
  }

  if (block.number == null || !block.hash) {
    return { status: 'not_found', networkId, queried: parsed.canonical }
  }

  const head = await client.getBlockNumber()

  return {
    status: 'found',
    networkId,
    queried: parsed.canonical,
    number: block.number,
    hash: block.hash,
    parentHash: block.parentHash,
    timestamp: Number(block.timestamp),
    gasUsed: block.gasUsed,
    gasLimit: block.gasLimit,
    baseFeePerGas: block.baseFeePerGas ?? null,
    miner: block.miner,
    transactions: block.transactions.map((tx) => {
      if (typeof tx === 'string') {
        throw new Error(
          'block-full lookup received hash-only transactions; includeTransactions must be true',
        )
      }
      return toTxRow(tx)
    }),
    head,
  }
}

/**
 * Point-read a block with full transactions. Malformed params resolve to
 * `invalid` and issue **zero** RPC calls. `BlockNotFoundError` is `not_found`;
 * anything else (transport, HTTP, timeout) throws so the page can tell those
 * apart (D13).
 *
 * Cached under `block-full:{networkId}:{id}` — distinct from F6u's
 * header-only `block:{networkId}:{n}` key. Sharing that key would serve a
 * block whose `transactions` are hash strings, not objects.
 */
export function getBlockDetail(
  networkId: NetworkId,
  blockNumberOrHash: string,
): Promise<BlockLookup> {
  const parsed = parseBlockId(blockNumberOrHash)
  if (!parsed) {
    return Promise.resolve({ status: 'invalid', queried: blockNumberOrHash })
  }
  return cached(`block-full:${networkId}:${parsed.canonical}`, () =>
    fetchBlockDetail(networkId, parsed),
  )
}
