import { decodeEventLog, type Address, type Hex, type Log } from 'viem'
import { erc20Abi, paymentSettlementEventsAbi } from '../config/abis'
import {
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
import { formatTokenAmount } from '../lib/format'

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
}

const ETHERSCAN_V2 = 'https://api.etherscan.io/v2/api'
const LOG_WINDOW_BLOCKS = 50_000n
const LOG_CHUNK = 2_000n
const ESCROW_ADDRESS = '0x9d8b8b7c476ab02306046f3da719d380fa0456aa'

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
  const apiKey = import.meta.env.VITE_ETHERSCAN_API_KEY
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
): Promise<Log[]> {
  const client = getPublicClient(networkId)
  const logs: Log[] = []
  let start = params.fromBlock
  while (start <= params.toBlock) {
    const end =
      start + LOG_CHUNK - 1n > params.toBlock
        ? params.toBlock
        : start + LOG_CHUNK - 1n
    try {
      const chunk = await client.getLogs({
        address: params.address,
        event: erc20Abi[1],
        args: params.args,
        fromBlock: start,
        toBlock: end,
      })
      logs.push(...chunk)
    } catch {
      // Skip failed chunks — public RPCs often reject wide eth_getLogs.
    }
    start = end + 1n
  }
  return logs
}

async function fetchRpcTransfers(
  networkId: NetworkId,
  address: string,
): Promise<TransferEvent[]> {
  const client = getPublicClient(networkId)
  const latest = await client.getBlockNumber()
  const fromBlock =
    latest > LOG_WINDOW_BLOCKS ? latest - LOG_WINDOW_BLOCKS : 0n
  const addr = address as Address
  const tokens = getTokens(networkId)

  const allLogs: Array<{ log: Log; token: TokenMeta }> = []

  for (const token of tokens) {
    const [outgoing, incoming] = await Promise.all([
      getLogsChunked(networkId, {
        address: token.address as Address,
        args: { from: addr },
        fromBlock,
        toBlock: latest,
      }),
      getLogsChunked(networkId, {
        address: token.address as Address,
        args: { to: addr },
        fromBlock,
        toBlock: latest,
      }),
    ])
    for (const log of [...outgoing, ...incoming]) {
      allLogs.push({ log, token })
    }
  }

  const seen = new Set<string>()
  const unique = allLogs.filter(({ log }) => {
    const key = `${log.transactionHash}-${log.logIndex}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const blockNums = [
    ...new Set(unique.map(({ log }) => log.blockNumber).filter(Boolean)),
  ] as bigint[]
  const timestamps = new Map<string, number>()
  await Promise.all(
    blockNums.slice(0, 40).map(async (bn) => {
      try {
        const block = await client.getBlock({ blockNumber: bn })
        timestamps.set(bn.toString(), Number(block.timestamp))
      } catch {
        /* ignore */
      }
    }),
  )

  const transfers = unique
    .map(({ log, token }) => {
      try {
        const decoded = decodeEventLog({
          abi: erc20Abi,
          data: log.data,
          topics: log.topics,
        })
        if (decoded.eventName !== 'Transfer') return null
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
        return null
      }
    })
    .filter((t): t is TransferEvent => t != null)

  transfers.sort((a, b) => b.blockNumber - a.blockNumber)
  return transfers
}

async function fetchEscrowEvents(
  networkId: NetworkId,
  address: string,
): Promise<EscrowLifecycleEvent[]> {
  const settlement = ESCROW_ADDRESS as Address
  const isEscrow =
    lookupAddress(networkId, address)?.role === 'escrow-contract'
  const client = getPublicClient(networkId)
  const latest = await client.getBlockNumber()
  const fromBlock =
    latest > LOG_WINDOW_BLOCKS ? latest - LOG_WINDOW_BLOCKS : 0n

  try {
    const logs = await client.getLogs({
      address: settlement,
      fromBlock,
      toBlock: latest,
      events: paymentSettlementEventsAbi,
    })

    const items: EscrowLifecycleEvent[] = []
    for (const log of logs) {
      try {
        const decoded = decodeEventLog({
          abi: paymentSettlementEventsAbi,
          data: log.data,
          topics: log.topics as [Hex, ...Hex[]],
        })
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
          if (!isEscrow && !related.includes(address.toLowerCase())) continue
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
          if (!isEscrow) continue
          const { paymentId, settledAmount, destinationAsset } = decoded.args
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
            refundedTo.toLowerCase() !== address.toLowerCase()
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
      } catch {
        /* skip undecodable */
      }
    }
    return items
  } catch {
    return []
  }
}

async function fetchTransfers(
  networkId: NetworkId,
  address: string,
): Promise<TransfersResult> {
  let transfers: TransferEvent[] = []
  let native: NativeTxEvent[] = []
  let source: TransferSource = 'explorer-api'
  let truncated = false
  let error: string | undefined

  try {
    const activity = await fetchExplorerActivity(networkId, address)
    transfers = activity.tokens
    native = activity.native
  } catch (err) {
    error = err instanceof Error ? err.message : 'Explorer API failed'
    try {
      transfers = await fetchRpcTransfers(networkId, address)
      source = 'rpc-logs'
      truncated = true
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

  const escrow = await fetchEscrowEvents(networkId, address).catch(() => [])
  const items: TimelineItem[] = [...transfers, ...native, ...escrow]
  items.sort((a, b) => {
    const tb = b.timestamp ?? 0
    const ta = a.timestamp ?? 0
    if (tb !== ta) return tb - ta
    return b.blockNumber - a.blockNumber
  })

  return { items, source, truncated, error }
}

export function getTransfers(
  networkId: NetworkId,
  address: string,
): Promise<TransfersResult> {
  const key = `transfers:${networkId}:${address.toLowerCase()}`
  return cached(key, () => fetchTransfers(networkId, address))
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
