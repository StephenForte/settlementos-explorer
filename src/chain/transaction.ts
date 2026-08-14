import {
  decodeEventLog,
  formatUnits,
  isHash,
  TransactionNotFoundError,
  TransactionReceiptNotFoundError,
  type Address,
  type Hash,
  type Hex,
  type Log,
} from 'viem'
import { erc20Abi, paymentSettlementEventsAbi } from '../config/abis'
import {
  labelForAddress,
  lookupToken,
  type TokenMeta,
} from '../config/address-book'
import { type NetworkId } from '../config/networks'
import { cached } from '../lib/cache'
import { getPublicClient } from '../lib/clients'
import { formatTokenAmount } from '../lib/format'

export type TxStatus = 'invalid' | 'not_found' | 'pending' | 'mined'

export interface Erc20TransferLog {
  kind: 'erc20-transfer'
  address: string
  token: TokenMeta | undefined
  from: string
  to: string
  fromLabel: string
  toLabel: string
  amountRaw: bigint
  /** Set only when the token is in the address book — never guessed. */
  amountFormatted: string | undefined
}

export interface EscrowEventLog {
  kind: 'escrow'
  address: string
  eventName: 'PaymentInitiated' | 'PaymentSettled' | 'PaymentRefunded'
  paymentId: string
  /** Same phrasing as `fetchEscrowEvents` in transfers.ts, when that helper sets one. */
  detail?: string
  from?: string
  to?: string
  fromLabel?: string
  toLabel?: string
  amountRaw?: bigint
  amountFormatted?: string
  token?: TokenMeta
}

export interface UndecodedLog {
  kind: 'undecoded'
  address: string
  topic0: string
  data: string
}

export type DecodedTxLog = Erc20TransferLog | EscrowEventLog | UndecodedLog

export interface TxInputSummary {
  kind: 'none' | 'call'
  selector?: string
  byteLength?: number
}

interface TxShared {
  networkId: NetworkId
  hash: Hash
  from: Address
  to: Address | null
  value: bigint
  nonce: number
  input: Hex
  gas: bigint
  type: string
}

export interface InvalidTxLookup {
  status: 'invalid'
  hash: string
}

export interface NotFoundTxLookup {
  status: 'not_found'
  networkId: NetworkId
  hash: Hash
}

export interface PendingTxLookup extends TxShared {
  status: 'pending'
}

export interface MinedTxLookup extends TxShared {
  status: 'mined'
  blockNumber: bigint
  transactionIndex: number | null
  timestamp: number
  confirmations: number
  receiptStatus: 'success' | 'reverted'
  gasUsed: bigint
  effectiveGasPrice: bigint | null
  l2ExecutionFeeWei: bigint | null
  contractAddress: Address | null
  logs: DecodedTxLog[]
}

export type TxLookup =
  | InvalidTxLookup
  | NotFoundTxLookup
  | PendingTxLookup
  | MinedTxLookup

/** 0x-prefixed 32-byte hex, normalised to lowercase. */
export function parseTxHash(value: string): Hash | null {
  const normalised = value.toLowerCase()
  return isHash(normalised) ? normalised : null
}

export function summarizeInput(input: Hex | string): TxInputSummary {
  if (!input || input === '0x') return { kind: 'none' }
  const hex = input.startsWith('0x') ? input.slice(2) : input
  const byteLength = Math.floor(hex.length / 2)
  const selector = `0x${hex.slice(0, 8)}`
  return { kind: 'call', selector, byteLength }
}

/**
 * Render a wei figure in gwei with full wei-derived precision (no 6-dp cap).
 * L2 execution fees on this chain are tens of gwei — ETH would round to zero
 * or print 17 fractional digits.
 */
export function formatGwei(wei: bigint): string {
  const formatted = formatUnits(wei, 9)
  const [whole, frac = ''] = formatted.split('.')
  const trimmed = frac.replace(/0+$/, '')
  return trimmed ? `${whole}.${trimmed}` : whole
}

export function formatRelativeAge(
  unixSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const delta = nowSeconds - unixSeconds
  if (delta < 0) return 'in the future'
  if (delta < 60) return `${delta}s ago`
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`
  const days = Math.floor(delta / 86400)
  return `${days}d ago`
}

function pendingLookup(
  networkId: NetworkId,
  tx: {
    hash: Hash
    from: Address
    to: Address | null
    value: bigint
    nonce: number
    input: Hex
    gas: bigint
    type: string
  },
): PendingTxLookup {
  return {
    status: 'pending',
    networkId,
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    value: tx.value,
    nonce: tx.nonce,
    input: tx.input,
    gas: tx.gas,
    type: tx.type,
  }
}

export function decodeReceiptLogs(
  networkId: NetworkId,
  logs: readonly Log[],
): DecodedTxLog[] {
  return logs.map((log) => decodeOneLog(networkId, log))
}

function decodeOneLog(networkId: NetworkId, log: Log): DecodedTxLog {
  const address = log.address
  const topic0 = log.topics[0] ?? '0x'
  const undecoded = (): UndecodedLog => ({
    kind: 'undecoded',
    address,
    topic0,
    data: log.data,
  })

  try {
    const decoded = decodeEventLog({
      abi: erc20Abi,
      data: log.data,
      topics: log.topics,
    })
    if (decoded.eventName === 'Transfer') {
      const { from, to, value } = decoded.args
      const token = lookupToken(networkId, address)
      return {
        kind: 'erc20-transfer',
        address,
        token,
        from,
        to,
        fromLabel: labelForAddress(networkId, from),
        toLabel: labelForAddress(networkId, to),
        amountRaw: value,
        amountFormatted: token
          ? formatTokenAmount(value, token.decimals)
          : undefined,
      }
    }
  } catch {
    /* not an ERC-20 Transfer */
  }

  try {
    const decoded = decodeEventLog({
      abi: paymentSettlementEventsAbi,
      data: log.data,
      topics: log.topics as [Hex, ...Hex[]],
    })
    if (decoded.eventName === 'PaymentInitiated') {
      const {
        paymentId,
        sender,
        recipient,
        asset,
        amount,
        sourceCurrency,
        destinationCurrency,
      } = decoded.args
      const token = lookupToken(networkId, asset)
      return {
        kind: 'escrow',
        address,
        eventName: 'PaymentInitiated',
        paymentId,
        from: sender,
        to: recipient,
        fromLabel: labelForAddress(networkId, sender),
        toLabel: labelForAddress(networkId, recipient),
        amountRaw: amount,
        amountFormatted: token
          ? formatTokenAmount(amount, token.decimals)
          : amount.toString(),
        token,
        detail: `${sourceCurrency} → ${destinationCurrency} · recipient ${labelForAddress(networkId, recipient)}`,
      }
    }
    if (decoded.eventName === 'PaymentSettled') {
      const { paymentId, settledAmount, destinationAsset } = decoded.args
      return {
        kind: 'escrow',
        address,
        eventName: 'PaymentSettled',
        paymentId,
        amountRaw: settledAmount,
        amountFormatted: settledAmount.toString(),
        detail: `settled as ${destinationAsset}`,
      }
    }
    if (decoded.eventName === 'PaymentRefunded') {
      const { paymentId, refundedTo, amount } = decoded.args
      return {
        kind: 'escrow',
        address,
        eventName: 'PaymentRefunded',
        paymentId,
        to: refundedTo,
        toLabel: labelForAddress(networkId, refundedTo),
        amountRaw: amount,
        amountFormatted: amount.toString(),
      }
    }
  } catch {
    /* not a PaymentSettlement event */
  }

  return undecoded()
}

async function fetchTransactionDetail(
  networkId: NetworkId,
  hash: Hash,
): Promise<TxLookup> {
  const client = getPublicClient(networkId)

  let tx
  try {
    tx = await client.getTransaction({ hash })
  } catch (err) {
    if (err instanceof TransactionNotFoundError) {
      return { status: 'not_found', networkId, hash }
    }
    throw err
  }

  if (!tx) {
    return { status: 'not_found', networkId, hash }
  }

  if (tx.blockNumber === null) {
    return pendingLookup(networkId, tx)
  }

  let receipt
  try {
    receipt = await client.getTransactionReceipt({ hash })
  } catch (err) {
    if (err instanceof TransactionReceiptNotFoundError) {
      return pendingLookup(networkId, tx)
    }
    throw err
  }

  const block = await cached(`block:${networkId}:${tx.blockNumber}`, () =>
    client.getBlock({ blockNumber: tx.blockNumber }),
  )
  const head = await client.getBlockNumber()
  const confirmations = Number(head - tx.blockNumber + 1n)
  const effectiveGasPrice = receipt.effectiveGasPrice ?? null
  const l2ExecutionFeeWei =
    effectiveGasPrice != null ? receipt.gasUsed * effectiveGasPrice : null

  return {
    status: 'mined',
    networkId,
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    value: tx.value,
    nonce: tx.nonce,
    input: tx.input,
    gas: tx.gas,
    type: tx.type,
    blockNumber: tx.blockNumber,
    transactionIndex: tx.transactionIndex,
    timestamp: Number(block.timestamp),
    confirmations,
    receiptStatus: receipt.status === 'success' ? 'success' : 'reverted',
    gasUsed: receipt.gasUsed,
    effectiveGasPrice,
    l2ExecutionFeeWei,
    contractAddress: receipt.contractAddress ?? null,
    logs: decodeReceiptLogs(networkId, receipt.logs),
  }
}

/**
 * Point-read a transaction. Malformed hashes resolve to `invalid` and issue
 * **zero** RPC calls. `TransactionNotFoundError` is `not_found`; anything else
 * (transport, HTTP, timeout) throws so the page can tell those apart.
 */
export function getTransactionDetail(
  networkId: NetworkId,
  hash: string,
): Promise<TxLookup> {
  const parsed = parseTxHash(hash)
  if (!parsed) {
    return Promise.resolve({ status: 'invalid', hash })
  }
  return cached(`tx:${networkId}:${parsed}`, () =>
    fetchTransactionDetail(networkId, parsed),
  )
}
