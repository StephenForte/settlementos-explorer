import {
  createPublicClient,
  custom,
  defineChain,
  encodeAbiParameters,
  encodeEventTopics,
  formatUnits,
  HttpRequestError,
  TransactionNotFoundError,
  TransactionReceiptNotFoundError,
  type Hex,
  type Log,
} from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { erc20Abi, paymentSettlementEventsAbi } from '../config/abis'
import { cacheClear } from '../lib/cache'
import {
  decodeReceiptLogs,
  formatGwei,
  getTransactionDetail,
  parseTxHash,
  summarizeInput,
} from './transaction'

const HASH =
  '0x876325b24398a3b08bc1abd6901bced99b2ad7e254f427e7b6ef5817288045c7' as const
const OPERATOR = '0x5128889F20Ec13e0Be38b2BeBC568594159B652d'
const ESCROW = '0x57b4a70fef917a0a3de89427f5d6654be0181f04'
const TREASURY = '0x3be68c872f0fcb5d0b204eceaffff8c04f4c9e4e'
const ACME = '0x0a32b64d50551e39a94be458de982fe9aab573d6'
const TOKYO = '0x66f38c702711b5211abda17f1095c4e572ea7253'
const MOCK_USDC = '0x7d7b168cfab3dba1afc41f6160e886ffe9997e63'
const UNKNOWN_TOKEN = '0x000000000000000000000000000000000000dEaD'
const PAYMENT_ID = ('0x' + 'aa'.repeat(32)) as Hex
const ROUTE_ID = ('0x' + 'bb'.repeat(32)) as Hex

const mocks = vi.hoisted(() => {
  const request = vi.fn()
  const getTransaction = vi.fn()
  const getTransactionReceipt = vi.fn()
  const getBlock = vi.fn()
  const getBlockNumber = vi.fn()
  const getPublicClient = vi.fn(() => ({
    request,
    getTransaction,
    getTransactionReceipt,
    getBlock,
    getBlockNumber,
  }))
  return {
    request,
    getTransaction,
    getTransactionReceipt,
    getBlock,
    getBlockNumber,
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
    request: mocks.request,
    getTransaction: mocks.getTransaction,
    getTransactionReceipt: mocks.getTransactionReceipt,
    getBlock: mocks.getBlock,
    getBlockNumber: mocks.getBlockNumber,
  }))
})

function logFrom(
  address: string,
  topics: Hex[],
  data: Hex,
): Log {
  return {
    address: address as Log['address'],
    topics: topics as Log['topics'],
    data,
    blockHash: HASH,
    blockNumber: 979595n,
    transactionHash: HASH,
    transactionIndex: 1,
    logIndex: 0,
    removed: false,
  }
}

function transferLog(token: string, from: string, to: string, value: bigint): Log {
  const topics = encodeEventTopics({
    abi: erc20Abi,
    eventName: 'Transfer',
    args: { from: from as `0x${string}`, to: to as `0x${string}` },
  })
  const data = encodeAbiParameters([{ type: 'uint256' }], [value])
  return logFrom(token, topics as Hex[], data)
}

function paymentSettledLog(): Log {
  const topics = encodeEventTopics({
    abi: paymentSettlementEventsAbi,
    eventName: 'PaymentSettled',
    args: { paymentId: PAYMENT_ID },
  })
  const data = encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'uint256' }, { type: 'string' }],
    [ROUTE_ID, 15_668_160n, 'mockJPY'],
  )
  return logFrom(ESCROW, topics as Hex[], data)
}

function paymentInitiatedLog(): Log {
  const topics = encodeEventTopics({
    abi: paymentSettlementEventsAbi,
    eventName: 'PaymentInitiated',
    args: {
      paymentId: PAYMENT_ID,
      sender: ACME as `0x${string}`,
      recipient: TOKYO as `0x${string}`,
    },
  })
  const data = encodeAbiParameters(
    [
      { type: 'address' },
      { type: 'uint256' },
      { type: 'string' },
      { type: 'string' },
    ],
    [MOCK_USDC, 100_000_000_000n, 'USD', 'JPY'],
  )
  return logFrom(ESCROW, topics as Hex[], data)
}

function minedTx() {
  return {
    hash: HASH,
    from: OPERATOR,
    to: ESCROW,
    value: 0n,
    nonce: 30,
    input: (`0xfc216bc9${'ab'.repeat(224)}`) as Hex,
    gas: 54_383n,
    blockNumber: 979_595n,
    transactionIndex: 1,
    type: 'eip1559',
  }
}

function minedReceipt(logs: Log[]) {
  return {
    status: 'success' as const,
    gasUsed: 49_387n,
    effectiveGasPrice: 1_000_251n,
    contractAddress: null,
    logs,
  }
}

describe('parseTxHash', () => {
  it('accepts a 32-byte hex hash and lowercases it', () => {
    expect(parseTxHash(HASH.toUpperCase())).toBe(HASH)
  })

  it('rejects malformed values', () => {
    expect(parseTxHash('not-a-hash')).toBeNull()
    expect(parseTxHash('0x123')).toBeNull()
    expect(parseTxHash('0x' + 'gg'.repeat(32))).toBeNull()
    expect(parseTxHash('')).toBeNull()
  })
})

describe('formatGwei / summarizeInput', () => {
  it('formats the golden-fixture fee without rounding to zero', () => {
    const feeWei = 49_387n * 1_000_251n
    expect(feeWei).toBe(49_399_396_137n)
    expect(formatGwei(feeWei)).toBe('49.399396137')
    expect(formatGwei(1_000_251n)).toBe('0.001000251')
  })

  it('summarises call data as selector plus byte length', () => {
    const input = `0xfc216bc9${'ab'.repeat(224)}`
    expect(summarizeInput(input)).toEqual({
      kind: 'call',
      selector: '0xfc216bc9',
      byteLength: 228,
    })
    expect(summarizeInput('0x')).toEqual({ kind: 'none' })
  })
})

describe('decodeReceiptLogs', () => {
  it('decodes PaymentSettled with labelled counterparties left to the Transfer log', () => {
    const logs = decodeReceiptLogs('fortel2-sepolia', [
      transferLog(MOCK_USDC, ESCROW, TREASURY, 100_000_000_000n),
      paymentSettledLog(),
    ])
    expect(logs[0]).toMatchObject({
      kind: 'erc20-transfer',
      fromLabel: 'PaymentSettlement',
      toLabel: 'Treasury',
      amountFormatted: '100000',
      token: { symbol: 'mockUSDC', decimals: 6 },
    })
    expect(logs[1]).toMatchObject({
      kind: 'escrow',
      eventName: 'PaymentSettled',
      amountFormatted: '15668160',
      detail: 'settled as mockJPY',
    })
  })

  it('decodes PaymentInitiated with labelled counterparties and token amount', () => {
    const [log] = decodeReceiptLogs('fortel2-sepolia', [paymentInitiatedLog()])
    expect(log).toMatchObject({
      kind: 'escrow',
      eventName: 'PaymentInitiated',
      fromLabel: 'ACME US Inc',
      toLabel: 'Tokyo Trading KK',
      amountFormatted: '100000',
      token: { symbol: 'mockUSDC' },
      detail: 'USD → JPY · recipient Tokyo Trading KK',
    })
  })

  it('renders an unknown-token Transfer as a raw integer with no decimal scaling', () => {
    const [log] = decodeReceiptLogs('fortel2-sepolia', [
      transferLog(UNKNOWN_TOKEN, ACME, ESCROW, 100_000_000_000n),
    ])
    expect(log.kind).toBe('erc20-transfer')
    if (log.kind !== 'erc20-transfer') return
    expect(log.token).toBeUndefined()
    expect(log.amountFormatted).toBeUndefined()
    expect(log.amountRaw).toBe(100_000_000_000n)
    expect(log.fromLabel).toBe('ACME US Inc')
  })

  it('labels logs from outside the address book as Not decoded without scaling data', () => {
    const raw = logFrom(UNKNOWN_TOKEN, [('0x' + '11'.repeat(32)) as Hex], '0xdeadbeef')
    const [log] = decodeReceiptLogs('fortel2-sepolia', [raw])
    expect(log).toEqual({
      kind: 'undecoded',
      address: UNKNOWN_TOKEN,
      topic0: '0x' + '11'.repeat(32),
      data: '0xdeadbeef',
    })
  })
})

describe('getTransactionDetail', () => {
  it('issues zero transport requests for a malformed hash', async () => {
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

    const result = await getTransactionDetail('fortel2-sepolia', 'not-a-hash')

    expect(transportCalls).toBe(0)
    expect(mocks.getPublicClient).not.toHaveBeenCalled()
    expect(mocks.getTransaction).not.toHaveBeenCalled()
    expect(result.status).toBe('invalid')
  })

  it('returns not_found for TransactionNotFoundError without treating it as transport failure', async () => {
    mocks.getTransaction.mockRejectedValue(new TransactionNotFoundError({ hash: HASH }))

    const result = await getTransactionDetail('fortel2-sepolia', HASH)

    expect(result.status).toBe('not_found')
    expect(mocks.getTransactionReceipt).not.toHaveBeenCalled()
  })

  it('rethrows a transport failure instead of collapsing it into not_found', async () => {
    mocks.getTransaction.mockRejectedValue(
      new HttpRequestError({
        url: 'http://127.0.0.1:9545',
        body: {},
        details: 'fetch failed',
      }),
    )

    await expect(getTransactionDetail('fortel2-sepolia', HASH)).rejects.toBeInstanceOf(
      HttpRequestError,
    )
  })

  it('returns pending when blockNumber is null and does not invent a zero fee', async () => {
    mocks.getTransaction.mockResolvedValue({
      ...minedTx(),
      blockNumber: null,
      transactionIndex: null,
    })

    const result = await getTransactionDetail('fortel2-sepolia', HASH)

    expect(result.status).toBe('pending')
    expect(result).not.toHaveProperty('l2ExecutionFeeWei')
    expect(result).not.toHaveProperty('confirmations')
    expect(result).not.toHaveProperty('receiptStatus')
    expect(mocks.getTransactionReceipt).not.toHaveBeenCalled()
  })

  it('returns pending when the receipt is not found yet', async () => {
    mocks.getTransaction.mockResolvedValue(minedTx())
    mocks.getTransactionReceipt.mockRejectedValue(
      new TransactionReceiptNotFoundError({ hash: HASH }),
    )

    const result = await getTransactionDetail('fortel2-sepolia', HASH)

    expect(result.status).toBe('pending')
    expect(mocks.getBlock).not.toHaveBeenCalled()
  })

  it('returns a mined lookup whose L2 execution fee equals gasUsed × effectiveGasPrice', async () => {
    const logs = [
      transferLog(MOCK_USDC, ESCROW, TREASURY, 100_000_000_000n),
      paymentSettledLog(),
    ]
    mocks.getTransaction.mockResolvedValue(minedTx())
    mocks.getTransactionReceipt.mockResolvedValue(minedReceipt(logs))
    mocks.getBlock.mockResolvedValue({ timestamp: 1_786_642_114n })
    mocks.getBlockNumber.mockResolvedValue(1_024_382n)

    const result = await getTransactionDetail('fortel2-sepolia', HASH)

    expect(result.status).toBe('mined')
    if (result.status !== 'mined') return
    const independentFee = 49_387n * 1_000_251n
    expect(result.l2ExecutionFeeWei).toBe(independentFee)
    expect(formatUnits(independentFee, 9)).toBe('49.399396137')
    expect(result.receiptStatus).toBe('success')
    expect(result.blockNumber).toBe(979_595n)
    expect(result.confirmations).toBe(Number(1_024_382n - 979_595n + 1n))
    expect(result.logs.map((l) => (l.kind === 'escrow' ? l.eventName : l.kind))).toEqual(
      ['erc20-transfer', 'PaymentSettled'],
    )
  })

  const nativeHash = '0x7ca9800e724c5c8bf5633d29e078192f2fb234737ecddcb120c32ff9d4d61be7'
  const blockHash = '0xd9e8a5b8c741dd99675f7e629d188e53dcc272092f86468145a0c56fcf44bf34'
  const parentHash = '0xd41092a4990c8d88e65e48a73cc102b509c5203b9c2d3673351a802fe6661896'
  const sender = '0xf8b8b3b58ebac9fc530d9244c22f391e90cc8ae2'
  const nativeTx = { ...minedTx(), from: sender, to: sender, blockHash, blockNumber: 3845842n, hash: nativeHash }
  function nativeFixture(transactions = [nativeTx]) {
    mocks.getTransaction.mockResolvedValue(nativeTx)
    mocks.getTransactionReceipt.mockResolvedValue({
      ...minedReceipt([]), gasUsed: 0x57a8n, effectiveGasPrice: 0x187b4n, l1Fee: '0x188f5',
    })
    mocks.getBlock.mockResolvedValue({ hash: blockHash, parentHash, timestamp: 1n, transactions })
    mocks.getBlockNumber.mockResolvedValue(nativeTx.blockNumber)
    mocks.request.mockImplementation(async ({ params }) => {
      expect(params[0]).toBe(sender)
      const balances = new Map([[parentHash, '0x23861f567d5fb8'], [blockHash, '0x23861ed05c9ca3']])
      return balances.get(params[1].blockHash)
    })
  }

  it('reads the two historical balances independently of both receipt fees', async () => {
    nativeFixture()
    expect(await getTransactionDetail('fortel2-sepolia', nativeHash)).toMatchObject({
      l2ExecutionFeeWei: 2_250_193_440n, l1DataFeeWei: 100_597n,
      senderBalanceChangeWei: -2_250_294_037n,
    })
    expect(mocks.request).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['another outgoing transaction', { ...nativeTx, hash: HASH }],
    ['incoming native value', { ...nativeTx, from: ESCROW, value: 1n, hash: HASH }],
  ] as const)('leaves the ledger unchecked with %s', async (_, other) => {
    nativeFixture([nativeTx, other])
    expect(await getTransactionDetail('fortel2-sepolia', nativeHash)).toMatchObject({ senderBalanceChangeWei: null })
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('keeps the mined receipt when the archive has pruned the sender balance', async () => {
    nativeFixture()
    mocks.request.mockRejectedValue(new Error('missing trie node'))
    expect(await getTransactionDetail('fortel2-sepolia', nativeHash)).toMatchObject({
      status: 'mined', senderBalanceChangeWei: null, l1DataFeeWei: 100_597n,
    })
  })

  it('caches a mined lookup so a second call does not re-hit RPC', async () => {
    mocks.getTransaction.mockResolvedValue(minedTx())
    mocks.getTransactionReceipt.mockResolvedValue(minedReceipt([]))
    mocks.getBlock.mockResolvedValue({ timestamp: 1n })
    mocks.getBlockNumber.mockResolvedValue(2n)

    await getTransactionDetail('fortel2-sepolia', HASH)
    await getTransactionDetail('fortel2-sepolia', HASH)

    expect(mocks.getTransaction).toHaveBeenCalledTimes(1)
  })
})
