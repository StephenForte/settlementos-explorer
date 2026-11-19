import { decodeEventLog, type Address, type Hex, type Log } from 'viem'
import { erc20Abi, paymentSettlementEventsAbi } from '../config/abis'
import {
  getEscrowAddress,
  getTokens,
  labelForAddress,
  lookupAddress,
  lookupToken,
  truncateAddress,
  type TokenMeta,
} from '../config/address-book'
import { NETWORKS, type NetworkId } from '../config/networks'
import { cached } from '../lib/cache'
import { getPublicClient } from '../lib/clients'
import { getEtherscanApiKey } from '../lib/env'
import { formatTokenAmount } from '../lib/format'
import { createNativeHistoryClient, discoverNativeHistory } from './native-history'

export type TransferSource = 'explorer-api' | 'rpc-logs'

export interface TransferEvent {
  kind: 'transfer'
  networkId: NetworkId
  from: string
  to: string
  fromLabel: string
  toLabel: string
  token: TokenMeta
  amountRaw: bigint
  amountFormatted: string
  txHash: string
  blockNumber: number
  timestamp: number | null
}

export interface NativeTxEvent {
  kind: 'native'
  networkId: NetworkId
  from: string
  to: string
  fromLabel: string
  toLabel: string
  amountRaw: bigint
  amountFormatted: string
  symbol: string
  txHash: string
  blockNumber: number
  timestamp: number | null
  method?: string
  failed?: boolean
}

export interface EscrowLifecycleEvent {
  kind: 'escrow'
  networkId: NetworkId
  eventName: 'PaymentInitiated' | 'PaymentSettled' | 'PaymentRefunded'
  paymentId: string
  relatedAddress?: string
  relatedLabel?: string
  amountRaw?: bigint
  amountFormatted?: string
  token?: TokenMeta
  detail?: string
  txHash: string
  blockNumber: number
  timestamp: number | null
}

export type TimelineItem = TransferEvent | NativeTxEvent | EscrowLifecycleEvent

export interface TransfersResult {
  items: TimelineItem[]
  source: TransferSource
  truncated: boolean
  error?: string
  coverage?: {
    sent: { found: number; expected: number } | undefined
    gaps: string[]
  }
}

const ETHERSCAN_V2 = 'https://api.etherscan.io/v2/api'
const LOG_WINDOW_BLOCKS = 50_000n
/** Block span per eth_getLogs request — also the liveness capability probe width. */
export const LOG_CHUNK = 2_000n
/**
 * Within-window getLogs loss above this ratio surfaces as TransfersResult.error.
 * At-or-below stays silent — public RPCs often reject a minority of chunks (D30).
 */
export const CHUNK_LOSS_SIGNAL_RATIO = 0.5
const HISTORY_LOG_SPAN = 100_000n
const HISTORY_SPAN_LIMIT = 128n
const HISTORY_TIMESTAMP_LIMIT = 512

function historyLogStart(tip: bigint) {
  const capacity = HISTORY_SPAN_LIMIT * HISTORY_LOG_SPAN
  return tip < capacity ? 0n : tip - capacity + 1n
}

type ChunkedLogsResult = {
  logs: Log[]
  chunksAttempted: number
  chunksFailed: number
}

function chunkLossWorthSignalling(
  chunksAttempted: number,
  chunksFailed: number,
): boolean {
  return (
    chunksAttempted > 0 &&
    chunksFailed > 0 &&
    chunksFailed / chunksAttempted > CHUNK_LOSS_SIGNAL_RATIO
  )
}

/** Dedupe identical failure messages; keep one representative per distinct text. */
function summarizeDirectionFailures(failures: Error[]): string {
  const counts = new Map<string, number>()
  for (const err of failures) {
    const msg = err.message || 'failed'
    counts.set(msg, (counts.get(msg) ?? 0) + 1)
  }
  return [...counts.keys()].join('; ')
}

interface EtherscanTokentxRow {
  hash: string
  from: string
  to: string
  contractAddress: string
  value: string
  tokenDecimal: string
  tokenSymbol: string
  timeStamp: string
  blockNumber: string
}

interface EtherscanTxlistRow {
  hash: string
  from: string
  to: string
  value: string
  timeStamp: string
  blockNumber: string
  isError?: string
  functionName?: string
  methodId?: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function annotateTransfer(
  networkId: NetworkId,
  partial: Omit<TransferEvent, 'fromLabel' | 'toLabel' | 'kind' | 'networkId'>,
): TransferEvent {
  return {
    kind: 'transfer',
    networkId,
    ...partial,
    fromLabel: labelForAddress(networkId, partial.from),
    toLabel: labelForAddress(networkId, partial.to),
  }
}

function annotateNative(
  networkId: NetworkId,
  partial: Omit<
    NativeTxEvent,
    'fromLabel' | 'toLabel' | 'kind' | 'networkId' | 'symbol'
  > & { symbol?: string },
): NativeTxEvent {
  return {
    kind: 'native',
    networkId,
    symbol: partial.symbol ?? NETWORKS[networkId].nativeSymbol,
    from: partial.from,
    to: partial.to,
    amountRaw: partial.amountRaw,
    amountFormatted: partial.amountFormatted,
    txHash: partial.txHash,
    blockNumber: partial.blockNumber,
    timestamp: partial.timestamp,
    method: partial.method,
    failed: partial.failed,
    fromLabel: labelForAddress(networkId, partial.from),
    toLabel: labelForAddress(networkId, partial.to),
  }
}

async function etherscanAccountAction<T>(
  networkId: NetworkId,
  address: string,
  action: 'tokentx' | 'txlist',
): Promise<T[]> {
  const chainId = NETWORKS[networkId].chainId
  const apiKey = getEtherscanApiKey()
  const params = new URLSearchParams({
    chainid: String(chainId),
    module: 'account',
    action,
    address,
    startblock: '0',
    endblock: '99999999',
    sort: 'desc',
    page: '1',
    offset: '100',
  })
  if (apiKey) params.set('apikey', apiKey)

  let lastStatus = 0
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${ETHERSCAN_V2}?${params}`)
    lastStatus = res.status
    if (res.status === 429) {
      await sleep(800 * (attempt + 1))
      continue
    }
    if (!res.ok) {
      throw new Error(`Explorer API HTTP ${res.status}`)
    }
    const body = (await res.json()) as {
      status: string
      message: string
      result: T[] | string
    }
    const resultText =
      typeof body.result === 'string' ? body.result.toLowerCase() : ''
    if (
      body.message?.toLowerCase().includes('rate limit') ||
      resultText.includes('rate limit')
    ) {
      await sleep(800 * (attempt + 1))
      continue
    }
    if (
      body.status === '0' &&
      (body.message === 'No transactions found' ||
        resultText.includes('no transactions found'))
    ) {
      return []
    }
    if (body.status !== '1' || !Array.isArray(body.result)) {
      throw new Error(
        typeof body.result === 'string'
          ? body.result
          : body.message || 'Explorer API error',
      )
    }
    return body.result
  }
  throw new Error(
    lastStatus === 429
      ? 'Explorer API rate limited (429)'
      : 'Explorer API request failed',
  )
}

async function fetchExplorerTokenTransfers(
  networkId: NetworkId,
  address: string,
): Promise<TransferEvent[]> {
  const rows = await etherscanAccountAction<EtherscanTokentxRow>(
    networkId,
    address,
    'tokentx',
  )
  const knownTokens = new Set(
    getTokens(networkId).map((t) => t.address.toLowerCase()),
  )

  return rows
    .filter((row) => knownTokens.has(row.contractAddress.toLowerCase()))
    .map((row) => {
      const token =
        lookupToken(networkId, row.contractAddress) ?? {
          address: row.contractAddress,
          symbol: row.tokenSymbol || truncateAddress(row.contractAddress),
          decimals: Number(row.tokenDecimal) || 0,
        }
      const amountRaw = BigInt(row.value)
      return annotateTransfer(networkId, {
        from: row.from,
        to: row.to,
        token,
        amountRaw,
        amountFormatted: formatTokenAmount(amountRaw, token.decimals),
        txHash: row.hash,
        blockNumber: Number(row.blockNumber),
        timestamp: Number(row.timeStamp) || null,
      })
    })
}

async function fetchExplorerNativeTxs(
  networkId: NetworkId,
  address: string,
): Promise<NativeTxEvent[]> {
  const rows = await etherscanAccountAction<EtherscanTxlistRow>(
    networkId,
    address,
    'txlist',
  )
  return rows.map((row) => {
    const amountRaw = BigInt(row.value || '0')
    const method =
      row.functionName?.split('(')[0] ||
      (row.methodId && row.methodId !== '0x' ? row.methodId : undefined)
    return annotateNative(networkId, {
      from: row.from,
      to: row.to || address,
      amountRaw,
      amountFormatted: formatTokenAmount(amountRaw, 18),
      txHash: row.hash,
      blockNumber: Number(row.blockNumber),
      timestamp: Number(row.timeStamp) || null,
      method,
      failed: row.isError === '1',
    })
  })
}

async function fetchExplorerActivity(
  networkId: NetworkId,
  address: string,
): Promise<{ tokens: TransferEvent[]; native: NativeTxEvent[] }> {
  const [tokenResult, nativeResult] = await Promise.allSettled([
    fetchExplorerTokenTransfers(networkId, address),
    fetchExplorerNativeTxs(networkId, address),
  ])

  const tokens =
    tokenResult.status === 'fulfilled' ? tokenResult.value : ([] as TransferEvent[])
  const native =
    nativeResult.status === 'fulfilled' ? nativeResult.value : ([] as NativeTxEvent[])

  if (tokenResult.status === 'rejected' && nativeResult.status === 'rejected') {
    throw tokenResult.reason instanceof Error
      ? tokenResult.reason
      : new Error('Explorer API failed')
  }

  return { tokens, native }
}

async function getLogsChunked(
  networkId: NetworkId,
  params: {
    address?: Address
    args?: { from?: Address | Address[]; to?: Address | Address[] }
    fromBlock: bigint
    toBlock: bigint
  },
  span = LOG_CHUNK,
): Promise<ChunkedLogsResult> {
  const client = getPublicClient(networkId)
  const logs: Log[] = []
  let start = params.fromBlock
  let chunksAttempted = 0
  let chunksFailed = 0
  while (start <= params.toBlock) {
    const end =
      start + span - 1n > params.toBlock
        ? params.toBlock
        : start + span - 1n
    chunksAttempted += 1
    try {
      const chunk = await client.getLogs({
        address: params.address,
        event: erc20Abi[1],
        args: params.args,
        fromBlock: start,
        toBlock: end,
      })
      for (const log of chunk) logs.push(log)
    } catch {
      // Skip failed chunks — public RPCs often reject some eth_getLogs windows.
      // Survivors still return; heavy within-window loss is signalled by the caller (D30).
      chunksFailed += 1
    }
    start = end + 1n
  }
  // Every chunk errored — not a quiet empty history. Callers set TransfersResult.error
  // (or reject); do not reuse `truncated` (that flag means explorer outage).
  if (chunksAttempted > 0 && chunksFailed === chunksAttempted) {
    throw new Error(
      `eth_getLogs failed for every chunk in the ${chunksAttempted}-chunk window`,
    )
  }
  return { logs, chunksAttempted, chunksFailed }
}

async function fetchRpcTransfers(
  networkId: NetworkId,
  address: string,
): Promise<{ transfers: TransferEvent[]; error?: string; gaps: string[] }> {
  const client = getPublicClient(networkId)
  const latest = await client.getBlockNumber()
  const fullHistory = !NETWORKS[networkId].etherscanApi
  const fromBlock = fullHistory
    ? historyLogStart(latest)
    : latest > LOG_WINDOW_BLOCKS ? latest - LOG_WINDOW_BLOCKS : 0n
  const span = fullHistory ? HISTORY_LOG_SPAN : LOG_CHUNK
  const gaps: string[] = []
  if (fullHistory && fromBlock > 0n) gaps.push('token history span limit reached')
  const addr = address as Address
  const tokens = getTokens(networkId)

  const allLogs: Array<{ log: Log; token: TokenMeta }> = []
  const directionFailures: Error[] = []
  let directionAttempts = 0
  let incompleteDirections = 0
  let incompleteChunksFailed = 0
  let incompleteChunksAttempted = 0
  let missedSpans = 0

  const recordDirection = (
    settled: PromiseSettledResult<ChunkedLogsResult>,
    token: TokenMeta,
  ) => {
    if (settled.status === 'fulfilled') {
      for (const log of settled.value.logs) {
        allLogs.push({ log, token })
      }
      const { chunksAttempted, chunksFailed } = settled.value
      missedSpans += chunksFailed
      if (chunkLossWorthSignalling(chunksAttempted, chunksFailed)) {
        incompleteDirections += 1
        incompleteChunksFailed += chunksFailed
        incompleteChunksAttempted += chunksAttempted
      }
      return
    }
    directionFailures.push(
      settled.reason instanceof Error
        ? settled.reason
        : new Error(String(settled.reason)),
    )
  }

  async function readToken(token: TokenMeta) {
    const [outgoing, incoming] = await Promise.allSettled([
      getLogsChunked(networkId, {
        address: token.address as Address,
        args: { from: addr },
        fromBlock,
        toBlock: latest,
      }, span),
      getLogsChunked(networkId, {
        address: token.address as Address,
        args: { to: addr },
        fromBlock,
        toBlock: latest,
      }, span),
    ])
    directionAttempts += 2
    recordDirection(outgoing, token)
    recordDirection(incoming, token)
  }
  if (fullHistory) {
    await Promise.all(tokens.map(readToken))
  } else {
    for (const token of tokens) await readToken(token)
  }

  // Every token×direction window failed — not a quiet empty history (F6r).
  // Partial survival returns below with error set (F6s).
  if (directionAttempts > 0 && directionFailures.length === directionAttempts) {
    throw directionFailures[0]!
  }

  const seen = new Set<string>()
  const unique = allLogs.filter(({ log }) => {
    const key = `${log.transactionHash}-${log.logIndex}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const blockNums = [
    ...new Set(unique.map(({ log }) => log.blockNumber).filter(
      (height) => fullHistory ? height !== null : Boolean(height),
    )),
  ] as bigint[]
  const timestamps = new Map<string, number>()
  const timestampLimit = fullHistory ? HISTORY_TIMESTAMP_LIMIT : 40
  if (fullHistory) blockNums.sort((a, b) => Number(b - a))
  const datedBlocks = blockNums.slice(0, timestampLimit)
  if (fullHistory && blockNums.length > timestampLimit) {
    gaps.push('some token dates are unavailable because the timestamp lookup limit was reached')
  }
  let missedDates = 0
  const timestampConcurrency = fullHistory ? 16 : 40
  for (let start = 0; start < datedBlocks.length; start += timestampConcurrency) {
    await Promise.all(datedBlocks.slice(start, start + timestampConcurrency).map(async (bn) => {
      try {
        const block = await client.getBlock({ blockNumber: bn })
        timestamps.set(bn.toString(), Number(block.timestamp))
      } catch {
        missedDates++
      }
    }))
  }
  if (fullHistory && missedDates) gaps.push('the RPC could not provide some token dates')

  let invalidLogs = 0
  const transfers = unique
    .map(({ log, token }) => {
      try {
        const decoded = decodeEventLog({
          abi: erc20Abi,
          data: log.data,
          topics: log.topics,
        })
        if (decoded.eventName !== 'Transfer') return null
        if (fullHistory && (log.transactionHash == null || log.blockNumber == null)) {
          invalidLogs++
          return null
        }
        const { from, to, value } = decoded.args
        return annotateTransfer(networkId, {
          from,
          to,
          token,
          amountRaw: value,
          amountFormatted: formatTokenAmount(value, token.decimals),
          txHash: log.transactionHash ?? '',
          blockNumber: Number(log.blockNumber ?? 0n),
          timestamp: timestamps.get(String(log.blockNumber)) ?? null,
        })
      } catch {
        invalidLogs++
        return null
      }
    })
    .filter((t): t is TransferEvent => t != null)

  transfers.sort((a, b) => b.blockNumber - a.blockNumber)

  const partialParts: string[] = []
  if (directionFailures.length > 0) {
    partialParts.push(
      `${directionFailures.length} of ${directionAttempts} token-directions failed — ${summarizeDirectionFailures(directionFailures)}`,
    )
  }
  if (incompleteDirections > 0) {
    partialParts.push(
      `${incompleteDirections} of ${directionAttempts} token-directions incomplete (${incompleteChunksFailed} of ${incompleteChunksAttempted} getLogs chunks failed)`,
    )
  }

  if (fullHistory && missedSpans > 0) {
    gaps.push(`RPC missed ${missedSpans} token log spans`)
  }
  if (fullHistory && invalidLogs) gaps.push('some token transfers could not be decoded')
  return {
    transfers,
    gaps,
    error:
      partialParts.length > 0
        ? `token history partial: ${partialParts.join('; ')}`
        : undefined,
  }
}

async function fetchRpcNativeTxs(
  networkId: NetworkId,
  address: string,
  onProgress: (items: NativeTxEvent[]) => void,
) {
  const client = createNativeHistoryClient(networkId)
  const self = address.toLowerCase()
  const items: NativeTxEvent[] = []
  const { expected, problems } = await discoverNativeHistory(client, address as Address, (block) => {
    const previousCount = items.length
    for (const tx of block.transactions) {
      if (typeof tx === 'string') continue
      const outgoing = tx.from.toLowerCase() === self
      if (!outgoing && tx.to?.toLowerCase() !== self) continue
      const input = tx.input ?? '0x'
      items.push(annotateNative(networkId, {
        from: tx.from,
        to: tx.to ?? address,
        amountRaw: tx.value,
        amountFormatted: formatTokenAmount(tx.value, 18),
        txHash: tx.hash,
        blockNumber: Number(block.number),
        timestamp: Number(block.timestamp),
        method: input !== '0x' ? input.slice(0, 10) : undefined,
      }))
    }
    if (items.length !== previousCount) {
      onProgress([...items].sort((a, b) => b.blockNumber - a.blockNumber))
    }
  })
  const found = items.filter((item) => item.from.toLowerCase() === self).length
  if (found !== expected) problems.push('the sent transaction count differs from the account nonce')
  return { items, coverage: { sent: { found, expected }, gaps: problems } }
}

function decodeEscrowHistory(
  networkId: NetworkId,
  address: string,
  settlement: Address,
  logs: Log[],
  fullHistory: boolean,
) {
  const isEscrow = lookupAddress(networkId, address)?.role === 'escrow-contract'
  let invalidLogs = 0
  const self = address.toLowerCase()
  const decodedLogs = logs.flatMap((log) => {
    try {
      const decoded = decodeEventLog({
        abi: paymentSettlementEventsAbi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      })
      return [{ log, decoded }]
    } catch {
      invalidLogs++
      return []
    }
  })
  const relatedPayments = new Set<string>()
  if (fullHistory && !isEscrow) {
    for (const { decoded } of decodedLogs) {
      if (decoded.eventName !== 'PaymentInitiated') continue
      const { sender, recipient, paymentId } = decoded.args
      if ([sender, recipient, settlement].some((party) => party.toLowerCase() === self)) {
        relatedPayments.add(paymentId)
      }
    }
  }

  const items: EscrowLifecycleEvent[] = []
  for (const { log, decoded } of decodedLogs) {
    const txHash = log.transactionHash ?? ''
    const blockNumber = Number(log.blockNumber ?? 0n)
    const base = {
      kind: 'escrow' as const,
      networkId,
      txHash,
      blockNumber,
      timestamp: null as number | null,
    }

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
      const related = [sender, recipient, settlement].map((a) =>
        a.toLowerCase(),
      )
      if (!isEscrow && !related.includes(self)) continue
      const token = lookupToken(networkId, asset)
      items.push({
        ...base,
        eventName: 'PaymentInitiated',
        paymentId,
        relatedAddress: sender,
        relatedLabel: labelForAddress(networkId, sender),
        amountRaw: amount,
        amountFormatted: token
          ? formatTokenAmount(amount, token.decimals)
          : amount.toString(),
        token,
        detail: `${sourceCurrency} → ${destinationCurrency} · recipient ${labelForAddress(networkId, recipient)}`,
      })
    } else if (decoded.eventName === 'PaymentSettled') {
      const { paymentId, settledAmount, destinationAsset } = decoded.args
      if (!isEscrow && !relatedPayments.has(paymentId)) continue
      items.push({
        ...base,
        eventName: 'PaymentSettled',
        paymentId,
        amountRaw: settledAmount,
        amountFormatted: settledAmount.toString(),
        detail: `settled as ${destinationAsset}`,
      })
    } else if (decoded.eventName === 'PaymentRefunded') {
      const { paymentId, refundedTo, amount } = decoded.args
      if (
        !isEscrow &&
        refundedTo.toLowerCase() !== self &&
        !relatedPayments.has(paymentId)
      ) {
        continue
      }
      items.push({
        ...base,
        eventName: 'PaymentRefunded',
        paymentId,
        relatedAddress: refundedTo,
        relatedLabel: labelForAddress(networkId, refundedTo),
        amountRaw: amount,
        amountFormatted: amount.toString(),
      })
    }
  }
  return { items, invalidLogs }
}

async function fetchEscrowEvents(networkId: NetworkId, address: string) {
  const gaps: string[] = []
  const escrowAddress = getEscrowAddress(networkId) as Address | undefined
  if (!escrowAddress) return { items: [], gaps }

  const client = getPublicClient(networkId)
  const tip = await client.getBlockNumber()
  const read = (fromBlock: bigint, toBlock: bigint) => client.getLogs({
    address: escrowAddress,
    fromBlock,
    toBlock,
    events: paymentSettlementEventsAbi,
  })
  const fullHistory = !NETWORKS[networkId].etherscanApi
  if (!fullHistory) {
    const fromBlock = tip > LOG_WINDOW_BLOCKS ? tip - LOG_WINDOW_BLOCKS : 0n
    const { items } = decodeEscrowHistory(
      networkId, address, escrowAddress, await read(fromBlock, tip), false,
    )
    return { items, gaps }
  }

  const start = historyLogStart(tip)
  if (start > 0n) gaps.push('escrow history span limit reached')
  let missedSpans = 0
  const logs: Log[] = []
  for (let from = start; from <= tip; from += HISTORY_LOG_SPAN) {
    const to = from + HISTORY_LOG_SPAN - 1n
    try {
      for (const log of await read(from, to < tip ? to : tip)) logs.push(log)
    } catch {
      missedSpans++
    }
  }
  if (missedSpans) gaps.push(`RPC missed ${missedSpans} escrow log spans`)
  const { items, invalidLogs } = decodeEscrowHistory(
    networkId, address, escrowAddress, logs, true,
  )
  if (invalidLogs) gaps.push('some escrow events could not be decoded')
  return { items, gaps }
}

async function fetchTransfers(
  networkId: NetworkId,
  address: string,
  onProgress: (items: NativeTxEvent[]) => void,
): Promise<TransfersResult> {
  let coverage: TransfersResult['coverage']
  let escrow: EscrowLifecycleEvent[] = []
  let transfers: TransferEvent[] = []
  let native: NativeTxEvent[] = []
  let source: TransferSource = 'explorer-api'
  let truncated = false
  let error: string | undefined

  if (NETWORKS[networkId].etherscanApi) {
    try {
      const activity = await fetchExplorerActivity(networkId, address)
      transfers = activity.tokens
      native = activity.native
    } catch (err) {
      error = err instanceof Error ? err.message : 'Explorer API failed'
      try {
        const rpc = await fetchRpcTransfers(networkId, address)
        transfers = rpc.transfers
        source = 'rpc-logs'
        truncated = true
        if (rpc.error) {
          error = `${error}; ${rpc.error}`
        }
      } catch (fallbackErr) {
        return {
          items: [],
          source: 'rpc-logs',
          truncated: true,
          error: `${error}; RPC fallback: ${
            fallbackErr instanceof Error ? fallbackErr.message : 'failed'
          }`,
        }
      }
    }
  } else {
    const [tokenResult, nativeResult, escrowResult] = await Promise.allSettled([
      fetchRpcTransfers(networkId, address),
      fetchRpcNativeTxs(networkId, address, onProgress),
      fetchEscrowEvents(networkId, address),
    ])

    coverage = { sent: undefined, gaps: [] }
    if (escrowResult.status === 'fulfilled') {
      escrow = escrowResult.value.items
      coverage.gaps.push(...escrowResult.value.gaps)
    } else {
      coverage.gaps.push('RPC could not read escrow history')
    }
    const softErrors: string[] = []
    let tokenHardFail = false
    let nativeHardFail = false

    if (tokenResult.status === 'fulfilled') {
      transfers = tokenResult.value.transfers
      coverage.gaps.push(...tokenResult.value.gaps)
      if (tokenResult.value.error) {
        softErrors.push(tokenResult.value.error)
      }
    } else {
      tokenHardFail = true
      softErrors.push(
        `token history: ${
          tokenResult.reason instanceof Error
            ? tokenResult.reason.message
            : 'failed'
        }`,
      )
    }

    if (nativeResult.status === 'fulfilled') {
      native = nativeResult.value.items
      coverage.sent = nativeResult.value.coverage.sent
      coverage.gaps.push(...nativeResult.value.coverage.gaps)
    } else {
      nativeHardFail = true
      softErrors.push(
        `native history: ${
          nativeResult.reason instanceof Error
            ? nativeResult.reason.message
            : 'failed'
        }`,
      )
    }

    source = 'rpc-logs'

    if (tokenHardFail && nativeHardFail && escrow.length === 0) {
      const reason =
        tokenResult.status === 'rejected' &&
        tokenResult.reason instanceof Error
          ? tokenResult.reason
          : new Error('RPC history failed')
      throw reason
    }
    if (softErrors.length > 0) {
      error = softErrors.join('; ')
    }
  }

  if (!coverage) {
    escrow = await fetchEscrowEvents(networkId, address)
      .then((result) => result.items)
      .catch(() => [])
  }
  const items: TimelineItem[] = [...transfers, ...native, ...escrow]
  items.sort((a, b) => {
    if (coverage) return b.blockNumber - a.blockNumber
    const tb = b.timestamp ?? 0
    const ta = a.timestamp ?? 0
    if (tb !== ta) return tb - ta
    return b.blockNumber - a.blockNumber
  })

  return { items, source, truncated, error, ...(coverage && { coverage }) }
}

type TransferProgress = (items: NativeTxEvent[]) => void

export async function getTransfers(
  networkId: NetworkId,
  address: string,
  onProgress?: TransferProgress,
): Promise<TransfersResult> {
  const key = `transfers:${networkId}:${address.toLowerCase()}`
  if (NETWORKS[networkId].etherscanApi) {
    return cached(key, () => fetchTransfers(networkId, address, () => {}))
  }
  // Share progress with callers joining the cached request. Using the same
  // cache for this channel also isolates requests across RPC override changes.
  const progress = await cached(`${key}:progress`, async () => ({
    latest: [] as NativeTxEvent[],
    listeners: new Set<TransferProgress>(),
  }))
  const result = cached(key, () => {
    progress.latest = []
    return fetchTransfers(networkId, address, (items) => {
      progress.latest = items
      for (const listener of progress.listeners) listener(items)
    })
  })
  if (!onProgress) return result
  progress.listeners.add(onProgress)
  try {
    if (progress.latest.length > 0) onProgress(progress.latest)
    return await result
  } finally {
    progress.listeners.delete(onProgress)
  }
}

export function onlyTransfers(items: TimelineItem[]): TransferEvent[] {
  return items.filter((i): i is TransferEvent => i.kind === 'transfer')
}

/** Aggregate directed transfer volume between address pairs. */
export function aggregateFlows(transfers: TransferEvent[]): Array<{
  from: string
  to: string
  fromLabel: string
  toLabel: string
  tokenSymbol: string
  totalRaw: bigint
  totalFormatted: string
  decimals: number
  count: number
}> {
  const map = new Map<
    string,
    {
      from: string
      to: string
      fromLabel: string
      toLabel: string
      token: TokenMeta
      totalRaw: bigint
      count: number
    }
  >()

  for (const t of transfers) {
    const key = `${t.from.toLowerCase()}→${t.to.toLowerCase()}→${t.token.address.toLowerCase()}`
    const existing = map.get(key)
    if (existing) {
      existing.totalRaw += t.amountRaw
      existing.count += 1
    } else {
      map.set(key, {
        from: t.from,
        to: t.to,
        fromLabel: t.fromLabel,
        toLabel: t.toLabel,
        token: t.token,
        totalRaw: t.amountRaw,
        count: 1,
      })
    }
  }

  return [...map.values()].map((v) => ({
    from: v.from,
    to: v.to,
    fromLabel: v.fromLabel,
    toLabel: v.toLabel,
    tokenSymbol: v.token.symbol,
    totalRaw: v.totalRaw,
    totalFormatted: formatTokenAmount(v.totalRaw, v.token.decimals),
    decimals: v.token.decimals,
    count: v.count,
  }))
}

export function counterpartySummary(
  address: string,
  transfers: TransferEvent[],
): Array<{
  address: string
  label: string
  inByToken: Record<string, { raw: bigint; formatted: string; decimals: number }>
  outByToken: Record<string, { raw: bigint; formatted: string; decimals: number }>
}> {
  const self = address.toLowerCase()
  const map = new Map<
    string,
    {
      address: string
      label: string
      inByToken: Record<string, { raw: bigint; decimals: number }>
      outByToken: Record<string, { raw: bigint; decimals: number }>
    }
  >()

  const bump = (
    bag: Record<string, { raw: bigint; decimals: number }>,
    symbol: string,
    amount: bigint,
    decimals: number,
  ) => {
    const cur = bag[symbol]
    if (cur) cur.raw += amount
    else bag[symbol] = { raw: amount, decimals }
  }

  for (const t of transfers) {
    const isOut = t.from.toLowerCase() === self
    const counterparty = isOut ? t.to : t.from
    const key = counterparty.toLowerCase()
    let entry = map.get(key)
    if (!entry) {
      entry = {
        address: counterparty,
        label: isOut ? t.toLabel : t.fromLabel,
        inByToken: {},
        outByToken: {},
      }
      map.set(key, entry)
    }
    if (isOut) {
      bump(entry.outByToken, t.token.symbol, t.amountRaw, t.token.decimals)
    } else {
      bump(entry.inByToken, t.token.symbol, t.amountRaw, t.token.decimals)
    }
  }

  const formatBag = (bag: Record<string, { raw: bigint; decimals: number }>) =>
    Object.fromEntries(
      Object.entries(bag).map(([sym, v]) => [
        sym,
        {
          raw: v.raw,
          formatted: formatTokenAmount(v.raw, v.decimals),
          decimals: v.decimals,
        },
      ]),
    )

  return [...map.values()].map((e) => ({
    address: e.address,
    label: e.label,
    inByToken: formatBag(e.inByToken),
    outByToken: formatBag(e.outByToken),
  }))
}
