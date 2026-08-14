import {
  BlockNotFoundError,
  createPublicClient,
  custom,
  defineChain,
  HttpRequestError,
  type Hex,
} from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cacheClear, cacheSet } from '../lib/cache'
import { getTransactionDetail } from './transaction'
import { getBlockDetail, parseBlockId } from './block'

const BLOCK_NUMBER = 979_595n
const BLOCK_HASH =
  '0x08fed8e2421fae5dfc513fa645518806e87dcbcbb155b4c81e98661d3dcf08cc' as const
const PARENT_HASH =
  '0x000306c145c4fd3dbc247a1f9104f8bce88d5fb47798a77ac5f84b9c67a9f6ad' as const
const SETTLEMENT_HASH =
  '0x876325b24398a3b08bc1abd6901bced99b2ad7e254f427e7b6ef5817288045c7' as const
const DEPOSIT_HASH =
  '0x1bafb919a9d9d838aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const
const OPERATOR = '0x5128889F20Ec13e0Be38b2BeBC568594159B652d'
const ESCROW = '0x9d8b8b7c476ab02306046f3da719d380fa0456aa'
const DEPOSITOR = '0xdeaddeaddeaddeaddeaddeaddeaddeaddead0001'
const L1_ATTRS = '0x4200000000000000000000000000000000000015'
const MINER = '0x4200000000000000000000000000000000000011'
const HEAD = 1_025_580n

const mocks = vi.hoisted(() => {
  const getBlock = vi.fn()
  const getBlockNumber = vi.fn()
  const getTransaction = vi.fn()
  const getTransactionReceipt = vi.fn()
  const getPublicClient = vi.fn(() => ({
    getBlock,
    getBlockNumber,
    getTransaction,
    getTransactionReceipt,
  }))
  return {
    getBlock,
    getBlockNumber,
    getTransaction,
    getTransactionReceipt,
    getPublicClient,
  }
})

vi.mock('../lib/clients', () => ({
  getPublicClient: mocks.getPublicClient,
}))

afterEach(() => {
  cacheClear()
  vi.clearAllMocks()
  mocks.getPublicClient.mockImplementation(() => ({
    getBlock: mocks.getBlock,
    getBlockNumber: mocks.getBlockNumber,
    getTransaction: mocks.getTransaction,
    getTransactionReceipt: mocks.getTransactionReceipt,
  }))
})

function depositTx() {
  return {
    hash: DEPOSIT_HASH,
    from: DEPOSITOR,
    to: L1_ATTRS,
    value: 0n,
    type: undefined,
  }
}

function settlementTx() {
  return {
    hash: SETTLEMENT_HASH,
    from: OPERATOR,
    to: ESCROW,
    value: 0n,
    type: 'eip1559',
  }
}

function fullBlock(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    number: BLOCK_NUMBER,
    hash: BLOCK_HASH,
    parentHash: PARENT_HASH,
    timestamp: 1_786_642_114n,
    gasUsed: 106_805n,
    gasLimit: 60_000_000n,
    baseFeePerGas: 251n,
    miner: MINER,
    transactions: [depositTx(), settlementTx()],
    ...overrides,
  }
}

describe('parseBlockId', () => {
  it('accepts a decimal number and strips leading zeros', () => {
    expect(parseBlockId('979595')).toEqual({
      kind: 'number',
      canonical: '979595',
      number: 979595n,
    })
    expect(parseBlockId('0979595')?.canonical).toBe('979595')
    expect(parseBlockId('0')).toEqual({
      kind: 'number',
      canonical: '0',
      number: 0n,
    })
  })

  it('accepts a 32-byte hex hash and lowercases it', () => {
    expect(parseBlockId(BLOCK_HASH.toUpperCase())).toEqual({
      kind: 'hash',
      canonical: BLOCK_HASH,
      hash: BLOCK_HASH,
    })
  })

  it('rejects malformed values', () => {
    expect(parseBlockId('not-a-block')).toBeNull()
    expect(parseBlockId('979595abc')).toBeNull()
    expect(parseBlockId('latest')).toBeNull()
    expect(parseBlockId('-1')).toBeNull()
    expect(parseBlockId('0x123')).toBeNull()
    expect(parseBlockId('0x' + 'ab'.repeat(31))).toBeNull()
    expect(parseBlockId('0x' + 'ab'.repeat(33))).toBeNull()
    expect(parseBlockId('')).toBeNull()
  })
})

describe('getBlockDetail', () => {
  it('issues zero transport requests for a malformed param', async () => {
    let transportCalls = 0
    const dummy = defineChain({
      id: 852,
      name: 'ForteL2 Sepolia',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: ['http://127.0.0.1:9545'] } },
    })
    mocks.getPublicClient.mockReturnValue(
      createPublicClient({
        chain: dummy,
        transport: custom({
          async request() {
            transportCalls += 1
            return null
          },
        }),
      }) as never,
    )

    const result = await getBlockDetail('fortel2-sepolia', 'not-a-block')

    expect(transportCalls).toBe(0)
    expect(mocks.getPublicClient).not.toHaveBeenCalled()
    expect(mocks.getBlock).not.toHaveBeenCalled()
    expect(result.status).toBe('invalid')
  })

  it('returns not_found for BlockNotFoundError without treating it as transport failure', async () => {
    mocks.getBlock.mockRejectedValue(
      new BlockNotFoundError({ blockNumber: 9_999_999n }),
    )

    const result = await getBlockDetail('fortel2-sepolia', '9999999')

    expect(result.status).toBe('not_found')
    expect(mocks.getBlockNumber).not.toHaveBeenCalled()
  })

  it('rethrows a transport failure instead of collapsing it into not_found', async () => {
    mocks.getBlock.mockRejectedValue(
      new HttpRequestError({
        url: 'http://127.0.0.1:9545',
        body: {},
        details: 'fetch failed',
      }),
    )

    await expect(
      getBlockDetail('fortel2-sepolia', '979595'),
    ).rejects.toBeInstanceOf(HttpRequestError)
    expect(mocks.getBlockNumber).not.toHaveBeenCalled()
  })

  it('issues exactly two RPC calls for a full page render and does not fan out per tx', async () => {
    mocks.getBlock.mockResolvedValue(fullBlock())
    mocks.getBlockNumber.mockResolvedValue(HEAD)

    const result = await getBlockDetail('fortel2-sepolia', '979595')

    expect(result.status).toBe('found')
    expect(mocks.getBlock).toHaveBeenCalledTimes(1)
    expect(mocks.getBlockNumber).toHaveBeenCalledTimes(1)
    expect(mocks.getTransaction).not.toHaveBeenCalled()
    expect(mocks.getBlock).toHaveBeenCalledWith({
      blockNumber: BLOCK_NUMBER,
      includeTransactions: true,
    })
  })

  it('renders the same block for a number param and a hash param', async () => {
    mocks.getBlock.mockResolvedValue(fullBlock())
    mocks.getBlockNumber.mockResolvedValue(HEAD)

    const byNumber = await getBlockDetail('fortel2-sepolia', '979595')
    const byHash = await getBlockDetail('fortel2-sepolia', BLOCK_HASH)

    expect(byNumber.status).toBe('found')
    expect(byHash.status).toBe('found')
    if (byNumber.status !== 'found' || byHash.status !== 'found') return
    expect(byNumber.number).toBe(byHash.number)
    expect(byNumber.hash).toBe(byHash.hash)
    expect(byNumber.transactions.map((tx) => tx.hash)).toEqual(
      byHash.transactions.map((tx) => tx.hash),
    )
    expect(mocks.getBlock).toHaveBeenNthCalledWith(1, {
      blockNumber: BLOCK_NUMBER,
      includeTransactions: true,
    })
    expect(mocks.getBlock).toHaveBeenNthCalledWith(2, {
      blockHash: BLOCK_HASH,
      includeTransactions: true,
    })
  })

  it('keeps a deposit tx whose type is undefined as a real row', async () => {
    mocks.getBlock.mockResolvedValue(fullBlock())
    mocks.getBlockNumber.mockResolvedValue(HEAD)

    const result = await getBlockDetail('fortel2-sepolia', '979595')

    expect(result.status).toBe('found')
    if (result.status !== 'found') return
    expect(result.transactions).toHaveLength(2)
    expect(result.transactions[0]?.hash).toBe(DEPOSIT_HASH)
    expect(result.transactions[0]?.type).toBeUndefined()
    expect(result.transactions[0]?.type).not.toBe('undefined')
    expect(result.transactions[1]?.hash).toBe(SETTLEMENT_HASH)
  })

  it('does not reuse F6u\'s header-only block: cache key', async () => {
    mocks.getTransaction.mockResolvedValue({
      hash: SETTLEMENT_HASH,
      from: OPERATOR,
      to: ESCROW,
      value: 0n,
      nonce: 30,
      input: '0x' as Hex,
      gas: 54_383n,
      blockNumber: BLOCK_NUMBER,
      transactionIndex: 1,
      type: 'eip1559',
    })
    mocks.getTransactionReceipt.mockResolvedValue({
      status: 'success' as const,
      gasUsed: 49_387n,
      effectiveGasPrice: 1_000_251n,
      contractAddress: null,
      logs: [],
    })
    mocks.getBlock.mockResolvedValue({
      timestamp: 1_786_642_114n,
      transactions: [DEPOSIT_HASH, SETTLEMENT_HASH],
    })
    mocks.getBlockNumber.mockResolvedValue(HEAD)

    await getTransactionDetail('fortel2-sepolia', SETTLEMENT_HASH)

    mocks.getBlock.mockResolvedValue(fullBlock())
    mocks.getBlockNumber.mockResolvedValue(HEAD)

    const result = await getBlockDetail('fortel2-sepolia', '979595')

    expect(result.status).toBe('found')
    if (result.status !== 'found') return
    expect(typeof result.transactions[1]).toBe('object')
    expect(result.transactions[1]?.from.toLowerCase()).toBe(
      OPERATOR.toLowerCase(),
    )
    expect(result.transactions[1]?.to?.toLowerCase()).toBe(ESCROW.toLowerCase())
    expect(result.transactions[1]?.value).toBe(0n)
    expect(mocks.getBlock).toHaveBeenLastCalledWith({
      blockNumber: BLOCK_NUMBER,
      includeTransactions: true,
    })
  })

  it('does not leak a seeded header-only block: entry into the tx list', async () => {
    cacheSet(`block:fortel2-sepolia:${BLOCK_NUMBER}`, {
      number: BLOCK_NUMBER,
      hash: BLOCK_HASH,
      transactions: [DEPOSIT_HASH, SETTLEMENT_HASH],
    })
    mocks.getBlock.mockResolvedValue(fullBlock())
    mocks.getBlockNumber.mockResolvedValue(HEAD)

    const result = await getBlockDetail('fortel2-sepolia', '979595')

    expect(result.status).toBe('found')
    if (result.status !== 'found') return
    expect(result.transactions[0]?.from.toLowerCase()).toBe(
      DEPOSITOR.toLowerCase(),
    )
    expect(result.transactions[1]?.from.toLowerCase()).toBe(
      OPERATOR.toLowerCase(),
    )
    expect(mocks.getBlock).toHaveBeenCalledTimes(1)
  })

  it('caches a found lookup so a second call does not re-hit RPC', async () => {
    mocks.getBlock.mockResolvedValue(fullBlock())
    mocks.getBlockNumber.mockResolvedValue(HEAD)

    await getBlockDetail('fortel2-sepolia', '979595')
    await getBlockDetail('fortel2-sepolia', '979595')

    expect(mocks.getBlock).toHaveBeenCalledTimes(1)
    expect(mocks.getBlockNumber).toHaveBeenCalledTimes(1)
  })
})
