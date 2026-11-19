import { encodeAbiParameters, encodeEventTopics, type Address, type Hex } from 'viem'
import { paymentSettlementEventsAbi } from '../config/abis'
import { getEscrowAddress } from '../config/address-book'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cacheClear } from '../lib/cache'
import {
  aggregateFlows,
  annotateTransfer,
  CHUNK_LOSS_SIGNAL_RATIO,
  counterpartySummary,
  getTransfers,
  onlyTransfers,
  type TransferEvent,
} from './transfers'

type MockBlock = {
  number: bigint
  timestamp: bigint
  transactions: Array<
    | string
    | {
        hash: string
        from: string
        to: string | null
        value: bigint
        input: string
      }
  >
}

const emptyBlock = (blockNumber?: bigint): MockBlock => ({
  number: blockNumber ?? 1n,
  timestamp: 1_700_000_000n,
  transactions: [],
})

const mockPublicClient = {
  getBlockNumber: vi.fn(async () => 1000n),
  getTransactionCount: vi.fn(async (_params: { blockNumber: bigint }) => 0),
  getBalance: vi.fn(async (_params: { blockNumber: bigint }) => 0n),
  getLogs: vi.fn(async (_params?: unknown) => [] as unknown[]),
  getBlock: vi.fn(
    async ({ blockNumber }: { blockNumber?: bigint } = {}): Promise<MockBlock> =>
      emptyBlock(blockNumber),
  ),
}

vi.mock('../lib/clients', () => ({
  getPublicClient: () => mockPublicClient,
}))

vi.mock('./native-history', async (importOriginal) => ({
  ...await importOriginal<typeof import('./native-history')>(),
  createNativeHistoryClient: () => mockPublicClient,
}))

afterEach(() => {
  mockPublicClient.getTransactionCount.mockReset().mockResolvedValue(0)
  mockPublicClient.getBalance.mockReset().mockResolvedValue(0n)
  cacheClear()
  vi.unstubAllGlobals()
  mockPublicClient.getBlockNumber.mockReset()
  mockPublicClient.getLogs.mockReset()
  mockPublicClient.getBlock.mockReset()
  mockPublicClient.getBlockNumber.mockResolvedValue(1000n)
  mockPublicClient.getLogs.mockResolvedValue([] as unknown[])
  mockPublicClient.getBlock.mockImplementation(
    async ({ blockNumber }: { blockNumber?: bigint } = {}) =>
      emptyBlock(blockNumber),
  )
})

function mockExplorerFetch(handlers: {
  tokentx?: unknown
  txlist?: unknown
  fail?: boolean
  failTokentx?: boolean
}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (handlers.fail) {
        return { ok: false, status: 500, json: async () => ({}) }
      }
      const url = String(input)
      if (url.includes('action=txlist')) {
        return {
          ok: true,
          status: 200,
          json: async () =>
            handlers.txlist ?? {
              status: '1',
              message: 'OK',
              result: [
                {
                  hash: '0xnative1',
                  from: '0x5128889F20Ec13e0Be38b2BeBC568594159B652d',
                  to: '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
                  value: '1000000000000000',
                  timeStamp: '1700000001',
                  blockNumber: '124',
                  isError: '0',
                  functionName: '',
                  methodId: '0x',
                },
              ],
            },
        }
      }
      if (handlers.failTokentx) {
        return { ok: false, status: 500, json: async () => ({}) }
      }
      return {
        ok: true,
        status: 200,
        json: async () =>
          handlers.tokentx ?? {
            status: '1',
            message: 'OK',
            result: [
              {
                hash: '0xtx1',
                from: '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
                to: '0x9d8b8b7c476ab02306046f3da719d380fa0456aa',
                contractAddress: '0x2066738d535681d28d0841cc2503c1c531d4d6aa',
                value: '25000000000',
                tokenDecimal: '6',
                tokenSymbol: 'mockUSDC',
                timeStamp: '1700000000',
                blockNumber: '123',
              },
            ],
          },
      }
    }),
  )
}

const sampleTransfer = (
  overrides: Partial<TransferEvent> = {},
): TransferEvent => ({
  kind: 'transfer',
  networkId: 'base-sepolia',
  from: '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
  to: '0x9d8b8b7c476ab02306046f3da719d380fa0456aa',
  fromLabel: 'ACME US Inc',
  toLabel: 'PaymentSettlement',
  token: {
    address: '0x2066738d535681d28d0841cc2503c1c531d4d6aa',
    symbol: 'mockUSDC',
    decimals: 6,
  },
  amountRaw: 25_000_000_000n,
  amountFormatted: '25000',
  txHash: '0xtx1',
  blockNumber: 123,
  timestamp: 1_700_000_000,
  ...overrides,
})

describe('annotateTransfer', () => {
  it('labels known counterparties and truncates unknowns', () => {
    const t = annotateTransfer('base-sepolia', {
      from: '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
      to: '0x00000000000000000000000000000000000000Aa',
      token: {
        address: '0x2066738d535681d28d0841cc2503c1c531d4d6aa',
        symbol: 'mockUSDC',
        decimals: 6,
      },
      amountRaw: 25_000_000_000n,
      amountFormatted: '25000',
      txHash: '0xabc',
      blockNumber: 1,
      timestamp: 1,
    })
    expect(t.fromLabel).toBe('ACME US Inc')
    expect(t.toLabel).toMatch(/^0x0000…/)
  })
})

describe('getTransfers', () => {
  it('parses explorer API happy path with token and native txs', async () => {
    mockExplorerFetch({})

    const result = await getTransfers(
      'base-sepolia',
      '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
    )
    expect(result.source).toBe('explorer-api')
    expect(result.truncated).toBe(false)
    const transfer = result.items.find((i) => i.kind === 'transfer')
    const native = result.items.find((i) => i.kind === 'native')
    expect(transfer?.kind).toBe('transfer')
    if (transfer?.kind === 'transfer') {
      expect(transfer.fromLabel).toBe('ACME US Inc')
      expect(transfer.toLabel).toBe('PaymentSettlement')
      expect(transfer.amountFormatted).toBe('25000')
    }
    expect(native?.kind).toBe('native')
    if (native?.kind === 'native') {
      expect(native.symbol).toBe('ETH')
      expect(native.toLabel).toBe('ACME US Inc')
    }
  })

  it('keeps native txs when tokentx fails but txlist succeeds', async () => {
    mockExplorerFetch({ failTokentx: true })

    const result = await getTransfers(
      'base-sepolia',
      '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
    )
    expect(result.source).toBe('explorer-api')
    expect(result.items.some((i) => i.kind === 'native')).toBe(true)
    expect(result.items.some((i) => i.kind === 'transfer')).toBe(false)
  })

  it('falls back to RPC logs when explorer API errors', async () => {
    mockExplorerFetch({ fail: true })

    const result = await getTransfers(
      'base-sepolia',
      '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
    )
    expect(result.source).toBe('rpc-logs')
    expect(result.truncated).toBe(true)
    expect(result.error).toMatch(/Explorer API/)
  })

  it('uses RPC as primary source without truncated for networks without Etherscan', async () => {
    const result = await getTransfers(
      'fortel2-sepolia',
      '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
    )
    expect(result.source).toBe('rpc-logs')
    expect(result.truncated).toBe(false)
    expect(result.error).toBeUndefined()
  })

  it('finds incoming value transfers by their historical balance change', async () => {
    const self = '0xFf489a6d49D68f9D0B564089C545C0768A33205f'
    const counterparty = '0x5128889F20Ec13e0Be38b2BeBC568594159B652d'
    mockPublicClient.getBlockNumber.mockResolvedValue(5n)
    mockPublicClient.getBalance.mockImplementation(async ({ blockNumber }) =>
      blockNumber >= 4n ? 1_000_000_000_000_000n : 0n,
    )
    mockPublicClient.getBlock.mockImplementation(
      async ({
        blockNumber,
        includeTransactions,
      }: {
        blockNumber?: bigint
        includeTransactions?: boolean
      } = {}): Promise<MockBlock> => {
        if (includeTransactions && blockNumber === 4n) {
          return {
            number: 4n,
            timestamp: 1_700_000_044n,
            transactions: [
              {
                hash: '0xnative-rpc-1',
                from: counterparty,
                to: self,
                value: 1_000_000_000_000_000n,
                input: '0x',
              },
            ],
          }
        }
        return emptyBlock(blockNumber)
      },
    )

    const result = await getTransfers('fortel2-sepolia', self)
    expect(result.source).toBe('rpc-logs')
    expect(result.truncated).toBe(false)
    const native = result.items.find((i) => i.kind === 'native')
    expect(native?.kind).toBe('native')
    if (native?.kind === 'native') {
      expect(native.symbol).toBe('ETH')
      expect(native.txHash).toBe('0xnative-rpc-1')
      expect(native.amountFormatted).toBe('0.001')
      expect(native.from.toLowerCase()).toBe(counterparty.toLowerCase())
      expect(native.to.toLowerCase()).toBe(self.toLowerCase())
    }
  })

  it('finds every send across a sparse history within a bounded native RPC budget', async () => {
    const self = '0xf8b8b3b58ebac9fc530d9244c22f391e90cc8ae2'
    const sentAt = [50n, 50n, 350n, 600n]
    mockPublicClient.getTransactionCount.mockImplementation(async ({ blockNumber }) =>
      sentAt.filter((height) => height <= blockNumber).length,
    )
    mockPublicClient.getBlock.mockImplementation(async ({ blockNumber } = {}) => ({
      ...emptyBlock(blockNumber),
      transactions: sentAt.flatMap((height, index) => height === blockNumber ? [{
        hash: `0xsend${index}`, from: self, to: self, value: 0n, input: '0x',
      }] : []),
    }))

    const nativeCalls = []
    for (const tip of [1_000n, 4_000_000n]) {
      cacheClear()
      mockPublicClient.getBlockNumber.mockResolvedValue(tip)
      for (const mock of [
        mockPublicClient.getTransactionCount, mockPublicClient.getBalance,
        mockPublicClient.getBlock, mockPublicClient.getLogs,
      ]) mock.mockClear()
      const onProgress = vi.fn()
      const result = await getTransfers('fortel2-sepolia', self, onProgress)
      expect(result.coverage).toEqual({ sent: { found: 4, expected: 4 }, gaps: [] })
      expect(result.items.map((item) => item.txHash)).toEqual([
        '0xsend3', '0xsend2', '0xsend0', '0xsend1',
      ])
      expect(onProgress).toHaveBeenCalled()
      expect(mockPublicClient.getBlock).toHaveBeenCalledTimes(3)
      nativeCalls.push(mockPublicClient.getTransactionCount.mock.calls.length +
        mockPublicClient.getBalance.mock.calls.length + mockPublicClient.getBlock.mock.calls.length)
      expect(mockPublicClient.getLogs).toHaveBeenCalledTimes(7 * Math.ceil(Number(tip + 1n) / 100_000))
      for (const [params] of mockPublicClient.getLogs.mock.calls) {
        const { fromBlock, toBlock } = params as { fromBlock: bigint; toBlock: bigint }
        expect(toBlock - fromBlock + 1n).toBeLessThanOrEqual(100_000n)
      }
    }
    // A 4,000-fold increase in head height adds only a few state-search rounds.
    expect(nativeCalls[1]).toBeLessThan(150)
    expect(nativeCalls[1]).toBeLessThan(nativeCalls[0]! * 3)
  })

  it('publishes native rows to concurrent callers while token and escrow logs are pending', async () => {
    const self = '0xf8b8b3b58ebac9fc530d9244c22f391e90cc8ae2'
    mockPublicClient.getBlockNumber.mockResolvedValue(1n)
    mockPublicClient.getTransactionCount.mockImplementation(async ({ blockNumber }) =>
      Number(blockNumber),
    )
    mockPublicClient.getBlock.mockResolvedValue({
      ...emptyBlock(1n),
      transactions: [{ hash: '0xsend', from: self, to: self, value: 0n, input: '0x' }],
    })
    let finishLogs: (logs: unknown[]) => void = () => {}
    const waitForLogs = new Promise<unknown[]>((resolve) => { finishLogs = resolve })
    mockPublicClient.getLogs.mockReturnValue(waitForLogs)
    const first = vi.fn()
    const second = vi.fn()
    const result = getTransfers('fortel2-sepolia', self, first)
    const secondResult = getTransfers('fortel2-sepolia', self, second)
    try {
      await vi.waitFor(() => {
        expect(first).toHaveBeenCalledWith([expect.objectContaining({ txHash: '0xsend' })])
        expect(second).toHaveBeenCalledWith([expect.objectContaining({ txHash: '0xsend' })])
      })
    } finally {
      finishLogs([])
      await Promise.all([result, secondResult])
    }
    expect(mockPublicClient.getBlock).toHaveBeenCalledTimes(1)
  })

  it('reports an archive gap with the sent count from the reachable head', async () => {
    mockPublicClient.getTransactionCount.mockImplementation(async ({ blockNumber }) => {
      if (blockNumber === 1000n) return 13
      throw new Error('missing trie node')
    })
    const result = await getTransfers(
      'fortel2-sepolia', '0xf8b8b3b58ebac9fc530d9244c22f391e90cc8ae2',
    )
    expect(result.items).toEqual([])
    expect(result.coverage?.sent).toEqual({ found: 0, expected: 13 })
    expect(result.coverage?.gaps).toContain(
      'some historical account states were unavailable from the RPC',
    )
  })

  it('reports partial coverage when the native full-block budget is exhausted', async () => {
    const self = '0xf8b8b3b58ebac9fc530d9244c22f391e90cc8ae2'
    mockPublicClient.getBlockNumber.mockResolvedValue(700n)
    mockPublicClient.getTransactionCount.mockImplementation(async ({ blockNumber }) =>
      Number(blockNumber),
    )
    mockPublicClient.getBlock.mockImplementation(async ({ blockNumber } = {}) => ({
      ...emptyBlock(blockNumber),
      transactions: [{
        hash: `0xsend-${blockNumber}`, from: self, to: self, value: 0n, input: '0x',
      }],
    }))

    const result = await getTransfers('fortel2-sepolia', self)
    expect(mockPublicClient.getBlock).toHaveBeenCalledTimes(512)
    expect(mockPublicClient.getTransactionCount.mock.calls.length).toBeLessThanOrEqual(2048)
    expect(result.coverage?.sent).toEqual({ found: 512, expected: 700 })
    expect(result.coverage?.gaps).toContain('native history full-block limit reached')
    expect(result.items).toHaveLength(512)
  })

  it('associates escrow settlement with a payment initiated in an older span', async () => {
    const self = '0xf8b8b3b58ebac9fc530d9244c22f391e90cc8ae2'
    const recipient = '0x5128889F20Ec13e0Be38b2BeBC568594159B652d'
    const paymentId = `0x${'01'.repeat(32)}` as Hex
    const escrow = getEscrowAddress('fortel2-sepolia') as Address
    mockPublicClient.getBlockNumber.mockResolvedValue(300_000n)
    mockPublicClient.getLogs.mockImplementation(async (params) => {
      const { address, fromBlock } = params as { address: Address; fromBlock: bigint }
      if (address !== escrow) return []
      if (fromBlock === 0n) return [{
        address, blockNumber: 20n, transactionHash: '0xinitiate', logIndex: 0,
        topics: encodeEventTopics({
          abi: paymentSettlementEventsAbi, eventName: 'PaymentInitiated',
          args: { sender: self, recipient, paymentId },
        }),
        data: encodeAbiParameters([
          { type: 'address' }, { type: 'uint256' }, { type: 'string' }, { type: 'string' },
        ], [escrow, 1n, 'USD', 'JPY']),
      }]
      if (fromBlock === 200_000n) return [{
        address, blockNumber: 200_005n, transactionHash: '0xsettle', logIndex: 0,
        topics: encodeEventTopics({
          abi: paymentSettlementEventsAbi, eventName: 'PaymentSettled', args: { paymentId },
        }),
        data: encodeAbiParameters([
          { type: 'bytes32' }, { type: 'uint256' }, { type: 'string' },
        ], [paymentId, 1n, 'JPY']),
      }]
      return []
    })
    const result = await getTransfers('fortel2-sepolia', self)
    expect(result.items).toMatchObject([
      { kind: 'escrow', eventName: 'PaymentSettled', paymentId, blockNumber: 200_005 },
      { kind: 'escrow', eventName: 'PaymentInitiated', paymentId, blockNumber: 20 },
    ])
    expect(result.coverage?.gaps).toEqual([])
  })

  it('rejects when primary RPC history fails on networks without Etherscan', async () => {
    mockPublicClient.getBlockNumber.mockRejectedValue(
      new Error('sequencer unreachable'),
    )

    await expect(
      getTransfers(
        'fortel2-sepolia',
        '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
      ),
    ).rejects.toThrow(/sequencer unreachable/)
  })

  it('sets error when one RPC source fails and the other returns empty', async () => {
    mockPublicClient.getBlockNumber
      .mockResolvedValueOnce(1000n)
      .mockRejectedValueOnce(new Error('native tip failed'))

    const result = await getTransfers(
      'fortel2-sepolia',
      '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
    )
    expect(result.source).toBe('rpc-logs')
    expect(result.truncated).toBe(false)
    expect(result.items).toHaveLength(0)
    expect(result.error).toMatch(/native tip failed/)
  })

  it('does not report a quiet empty history when every getLogs chunk fails', async () => {
    mockPublicClient.getBlockNumber.mockResolvedValue(1000n)
    mockPublicClient.getLogs.mockRejectedValue(new Error('block range rejected'))

    const result = await getTransfers(
      'fortel2-sepolia',
      '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
    )
    expect(result.source).toBe('rpc-logs')
    expect(result.truncated).toBe(false)
    expect(result.items).toHaveLength(0)
    expect(result.error).toMatch(/eth_getLogs failed for every chunk/)
  })

  it('keeps a healthy token transfer when a sibling token fails every chunk', async () => {
    const self = '0xFf489a6d49D68f9D0B564089C545C0768A33205f'
    const mockUsdc = '0x7d7b168cfab3dba1afc41f6160e886ffe9997e63'
    const mockJpy = '0x0b6fa033c034d694e876b56f2dd8377a2be5691d'
    mockPublicClient.getBlockNumber.mockResolvedValue(1000n)
    mockPublicClient.getLogs.mockImplementation(async (params?: unknown) => {
      const { address, args } = (params ?? {}) as {
        address?: string
        args?: { from?: string; to?: string }
      }
      if (address?.toLowerCase() === mockJpy.toLowerCase()) {
        throw new Error('block range rejected')
      }
      if (
        address?.toLowerCase() === mockUsdc.toLowerCase() &&
        args?.from?.toLowerCase() === self.toLowerCase()
      ) {
        return [
          {
            address: mockUsdc,
            blockNumber: 100n,
            transactionHash: '0xhealthy-usdc',
            logIndex: 0,
            topics: [
              '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
              `0x${self.slice(2).toLowerCase().padStart(64, '0')}`,
              `0x${'9d8b8b7c476ab02306046f3da719d380fa0456aa'.padStart(64, '0')}`,
            ],
            data: `0x${(1_000_000n).toString(16).padStart(64, '0')}`,
          },
        ]
      }
      return []
    })

    const result = await getTransfers('fortel2-sepolia', self)
    expect(result.source).toBe('rpc-logs')
    expect(result.truncated).toBe(false)
    // mockJPY out+in fail; mockUSDC + mockSGD succeed → 2 of 6.
    expect(result.error).toMatch(
      /token history partial: 2 of 6 token-directions failed — eth_getLogs failed for every chunk in the 1-chunk window$/,
    )
    // Identical underlying failures must not be concatenated repeatedly.
    expect(
      (result.error!.match(/eth_getLogs failed for every chunk/g) ?? []).length,
    ).toBe(1)
    const transfer = result.items.find((i) => i.kind === 'transfer')
    expect(transfer?.kind).toBe('transfer')
    if (transfer?.kind === 'transfer') {
      expect(transfer.txHash).toBe('0xhealthy-usdc')
      expect(transfer.token.symbol).toBe('mockUSDC')
    }
  })

  it('keeps the successful direction when the other direction fails for a token', async () => {
    const self = '0xFf489a6d49D68f9D0B564089C545C0768A33205f'
    const mockUsdc = '0x7d7b168cfab3dba1afc41f6160e886ffe9997e63'
    mockPublicClient.getBlockNumber.mockResolvedValue(1000n)
    mockPublicClient.getLogs.mockImplementation(async (params?: unknown) => {
      const { address, args } = (params ?? {}) as {
        address?: string
        args?: { from?: string; to?: string }
      }
      // Outgoing always fails; incoming for mockUSDC succeeds.
      if (args?.from) {
        throw new Error('outgoing window rejected')
      }
      if (
        address?.toLowerCase() === mockUsdc.toLowerCase() &&
        args?.to?.toLowerCase() === self.toLowerCase()
      ) {
        return [
          {
            address: mockUsdc,
            blockNumber: 101n,
            transactionHash: '0xincoming-only',
            logIndex: 0,
            topics: [
              '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
              `0x${'5128889f20ec13e0be38b2bebc568594159b652d'.padStart(64, '0')}`,
              `0x${self.slice(2).toLowerCase().padStart(64, '0')}`,
            ],
            data: `0x${(2_000_000n).toString(16).padStart(64, '0')}`,
          },
        ]
      }
      return []
    })

    const result = await getTransfers('fortel2-sepolia', self)
    expect(result.source).toBe('rpc-logs')
    expect(result.truncated).toBe(false)
    // All three tokens' outgoing directions fail → 3 of 6.
    expect(result.error).toMatch(
      /token history partial: 3 of 6 token-directions failed — eth_getLogs failed for every chunk in the 1-chunk window$/,
    )
    expect(
      (result.error!.match(/eth_getLogs failed for every chunk/g) ?? []).length,
    ).toBe(1)
    const transfer = result.items.find((i) => i.kind === 'transfer')
    expect(transfer?.kind).toBe('transfer')
    if (transfer?.kind === 'transfer') {
      expect(transfer.txHash).toBe('0xincoming-only')
    }
  })

  it('dedupes identical direction-failure messages instead of repeating them', async () => {
    mockPublicClient.getBlockNumber.mockResolvedValue(1000n)
    mockPublicClient.getLogs.mockRejectedValue(
      new Error('eth_getLogs failed for every chunk in the 1-chunk window'),
    )
    // Force one direction to succeed so we take the soft-partial path, not throw.
    const self = '0xFf489a6d49D68f9D0B564089C545C0768A33205f'
    const mockUsdc = '0x7d7b168cfab3dba1afc41f6160e886ffe9997e63'
    mockPublicClient.getLogs.mockImplementation(async (params?: unknown) => {
      const { address, args } = (params ?? {}) as {
        address?: string
        args?: { from?: string; to?: string }
      }
      if (
        address?.toLowerCase() === mockUsdc.toLowerCase() &&
        args?.to?.toLowerCase() === self.toLowerCase()
      ) {
        return []
      }
      throw new Error('eth_getLogs failed for every chunk in the 1-chunk window')
    })

    const result = await getTransfers('fortel2-sepolia', self)
    expect(result.error).toMatch(
      /token history partial: 5 of 6 token-directions failed/,
    )
    expect(result.error).toMatch(
      /eth_getLogs failed for every chunk in the 1-chunk window/,
    )
    // Anti-goal: the same sentence repeated with "; " joins (reviewer 311-char case).
    const sentence =
      'eth_getLogs failed for every chunk in the 1-chunk window'
    const occurrences = result.error!.split(sentence).length - 1
    expect(occurrences).toBe(1)
    expect(result.error!.length).toBeLessThan(200)
  })

  it('returns a clean empty result when every getLogs call succeeds with no transfers', async () => {
    mockPublicClient.getBlockNumber.mockResolvedValue(1000n)
    mockPublicClient.getLogs.mockResolvedValue([])

    const result = await getTransfers(
      'fortel2-sepolia',
      '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
    )
    expect(result.source).toBe('rpc-logs')
    expect(result.truncated).toBe(false)
    expect(result.error).toBeUndefined()
    expect(result.items.filter((i) => i.kind === 'transfer')).toHaveLength(0)
  })

  it('returns a clean non-empty result when every getLogs call succeeds with transfers', async () => {
    const self = '0xFf489a6d49D68f9D0B564089C545C0768A33205f'
    const mockUsdc = '0x7d7b168cfab3dba1afc41f6160e886ffe9997e63'
    mockPublicClient.getBlockNumber.mockResolvedValue(1000n)
    mockPublicClient.getLogs.mockImplementation(async (params?: unknown) => {
      const { address, args } = (params ?? {}) as {
        address?: string
        args?: { from?: string; to?: string }
      }
      if (
        address?.toLowerCase() === mockUsdc.toLowerCase() &&
        args?.from?.toLowerCase() === self.toLowerCase()
      ) {
        return [
          {
            address: mockUsdc,
            blockNumber: 100n,
            transactionHash: '0xclean-usdc',
            logIndex: 0,
            topics: [
              '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
              `0x${self.slice(2).toLowerCase().padStart(64, '0')}`,
              `0x${'9d8b8b7c476ab02306046f3da719d380fa0456aa'.padStart(64, '0')}`,
            ],
            data: `0x${(1_000_000n).toString(16).padStart(64, '0')}`,
          },
        ]
      }
      return []
    })

    const result = await getTransfers('fortel2-sepolia', self)
    expect(result.source).toBe('rpc-logs')
    expect(result.truncated).toBe(false)
    expect(result.error).toBeUndefined()
    const transfer = result.items.find((i) => i.kind === 'transfer')
    expect(transfer?.kind).toBe('transfer')
    if (transfer?.kind === 'transfer') {
      expect(transfer.txHash).toBe('0xclean-usdc')
    }
  })

  it('keeps survivors and stays silent when within-window loss is at or below the signal ratio', async () => {
    const self = '0xFf489a6d49D68f9D0B564089C545C0768A33205f'
    const token = '0x7d7b168cfab3dba1afc41f6160e886ffe9997e63'
    // Three inclusive 100k spans in [0, 200000], with a one-block final span.
    // 1/3 failed = below CHUNK_LOSS_SIGNAL_RATIO (0.5).
    expect(1 / 3).toBeLessThanOrEqual(CHUNK_LOSS_SIGNAL_RATIO)
    mockPublicClient.getBlockNumber.mockResolvedValue(200000n)
    mockPublicClient.getLogs.mockImplementation(async (params?: unknown) => {
      const { fromBlock, args } = (params ?? {}) as {
        fromBlock?: bigint
        args?: { from?: string; to?: string }
      }
      // Fail the middle chunk only; succeed elsewhere with one outgoing Transfer.
      if (fromBlock === 100000n) {
        throw new Error('chunk rejected')
      }
      if (fromBlock === 0n && args?.from) {
        return [
          {
            address: token,
            blockNumber: 100n,
            transactionHash: '0xpartial-chunk',
            logIndex: 0,
            topics: [
              '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
              `0x${self.slice(2).toLowerCase().padStart(64, '0')}`,
              `0x${'9d8b8b7c476ab02306046f3da719d380fa0456aa'.padStart(64, '0')}`,
            ],
            data: `0x${(1_000_000n).toString(16).padStart(64, '0')}`,
          },
        ]
      }
      return []
    })

    const result = await getTransfers('fortel2-sepolia', self)
    expect(result.source).toBe('rpc-logs')
    expect(result.truncated).toBe(false)
    expect(result.error).toBeUndefined()
    expect(result.coverage?.gaps).toEqual(expect.arrayContaining([
      expect.stringMatching(/RPC missed .* token log spans/),
    ]))
    const transfer = result.items.find((i) => i.kind === 'transfer')
    expect(transfer?.kind).toBe('transfer')
    if (transfer?.kind === 'transfer') {
      expect(transfer.txHash).toBe('0xpartial-chunk')
    }
  })

  it('stays silent when within-window loss equals the signal ratio exactly', async () => {
    const self = '0xFf489a6d49D68f9D0B564089C545C0768A33205f'
    const token = '0x7d7b168cfab3dba1afc41f6160e886ffe9997e63'
    // Four chunks in [0, 399999]: 0, 100000, 200000, 300000. Fail exactly two → 0.50.
    expect(2 / 4).toBe(CHUNK_LOSS_SIGNAL_RATIO)
    mockPublicClient.getBlockNumber.mockResolvedValue(399999n)
    mockPublicClient.getLogs.mockImplementation(async (params?: unknown) => {
      const { fromBlock, args } = (params ?? {}) as {
        fromBlock?: bigint
        args?: { from?: string; to?: string }
      }
      if (fromBlock === 100000n || fromBlock === 200000n) {
        throw new Error('chunk rejected')
      }
      if (fromBlock === 0n && args?.from) {
        return [
          {
            address: token,
            blockNumber: 100n,
            transactionHash: '0xexact-ratio',
            logIndex: 0,
            topics: [
              '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
              `0x${self.slice(2).toLowerCase().padStart(64, '0')}`,
              `0x${'9d8b8b7c476ab02306046f3da719d380fa0456aa'.padStart(64, '0')}`,
            ],
            data: `0x${(1_000_000n).toString(16).padStart(64, '0')}`,
          },
        ]
      }
      return []
    })

    const result = await getTransfers('fortel2-sepolia', self)
    expect(result.source).toBe('rpc-logs')
    expect(result.truncated).toBe(false)
    // Pins strict `>`: equality must not signal (D30).
    expect(result.error).toBeUndefined()
    expect(result.coverage?.gaps).toEqual(expect.arrayContaining([
      expect.stringMatching(/RPC missed .* token log spans/),
    ]))
    const transfer = result.items.find((i) => i.kind === 'transfer')
    expect(transfer?.kind).toBe('transfer')
    if (transfer?.kind === 'transfer') {
      expect(transfer.txHash).toBe('0xexact-ratio')
    }
  })

  it('signals when within-window getLogs loss exceeds the signal ratio', async () => {
    const self = '0xFf489a6d49D68f9D0B564089C545C0768A33205f'
    const token = '0x7d7b168cfab3dba1afc41f6160e886ffe9997e63'
    // Three chunks; fail two on the USDC outgoing direction only → 2/3 > 0.5.
    expect(2 / 3).toBeGreaterThan(CHUNK_LOSS_SIGNAL_RATIO)
    mockPublicClient.getBlockNumber.mockResolvedValue(200000n)
    mockPublicClient.getLogs.mockImplementation(async (params?: unknown) => {
      const { address, fromBlock, args } = (params ?? {}) as {
        address?: string
        fromBlock?: bigint
        args?: { from?: string; to?: string }
      }
      const isUsdcOutgoing =
        address?.toLowerCase() === token.toLowerCase() &&
        args?.from?.toLowerCase() === self.toLowerCase()
      if (isUsdcOutgoing && (fromBlock === 100000n || fromBlock === 200000n)) {
        throw new Error('chunk rejected')
      }
      if (isUsdcOutgoing && fromBlock === 0n) {
        return [
          {
            address: token,
            blockNumber: 100n,
            transactionHash: '0xheavy-loss',
            logIndex: 0,
            topics: [
              '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
              `0x${self.slice(2).toLowerCase().padStart(64, '0')}`,
              `0x${'9d8b8b7c476ab02306046f3da719d380fa0456aa'.padStart(64, '0')}`,
            ],
            data: `0x${(1_000_000n).toString(16).padStart(64, '0')}`,
          },
        ]
      }
      return []
    })

    const result = await getTransfers('fortel2-sepolia', self)
    expect(result.source).toBe('rpc-logs')
    expect(result.truncated).toBe(false)
    expect(result.error).toMatch(
      /token history partial: 1 of 6 token-directions incomplete \(2 of 3 getLogs chunks failed\)/,
    )
    const transfer = result.items.find((i) => i.kind === 'transfer')
    expect(transfer?.kind).toBe('transfer')
    if (transfer?.kind === 'transfer') {
      expect(transfer.txHash).toBe('0xheavy-loss')
    }
  })

  it('rejects when every token-direction fails and native history also fails', async () => {
    mockPublicClient.getBlockNumber
      .mockResolvedValueOnce(1000n) // token tip
      .mockRejectedValueOnce(new Error('native tip failed')) // native scan tip
    mockPublicClient.getLogs.mockRejectedValue(new Error('block range rejected'))

    await expect(
      getTransfers(
        'fortel2-sepolia',
        '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
      ),
    ).rejects.toThrow(/eth_getLogs failed for every chunk/)
  })

  it('filters unknown ERC-20s out of tokentx results', async () => {
    mockExplorerFetch({
      tokentx: {
        status: '1',
        message: 'OK',
        result: [
          {
            hash: '0xspam',
            from: '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
            to: '0x9d8b8b7c476ab02306046f3da719d380fa0456aa',
            contractAddress: '0x00000000000000000000000000000000000000ff',
            value: '1',
            tokenDecimal: '18',
            tokenSymbol: 'SPAM',
            timeStamp: '1700000000',
            blockNumber: '123',
          },
        ],
      },
      txlist: { status: '0', message: 'No transactions found', result: [] },
    })

    const result = await getTransfers(
      'base-sepolia',
      '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
    )
    expect(onlyTransfers(result.items)).toHaveLength(0)
  })
})

describe('aggregateFlows', () => {
  it('sums directed volume per token pair', () => {
    const flows = aggregateFlows([
      sampleTransfer(),
      sampleTransfer({
        amountRaw: 5_000_000_000n,
        amountFormatted: '5000',
        txHash: '0xtx2',
      }),
    ])
    expect(flows).toHaveLength(1)
    expect(flows[0]!.totalFormatted).toBe('30000')
    expect(flows[0]!.count).toBe(2)
    expect(flows[0]!.fromLabel).toBe('ACME US Inc')
    expect(flows[0]!.toLabel).toBe('PaymentSettlement')
  })
})

describe('counterpartySummary', () => {
  it('aggregates in/out totals per counterparty', () => {
    const self = '0xFf489a6d49D68f9D0B564089C545C0768A33205f'
    const rows = counterpartySummary(self, [
      sampleTransfer(),
      sampleTransfer({
        from: '0xb31E5c977E468120875A384B42C482E83d999A6B',
        to: self,
        fromLabel: 'Treasury',
        toLabel: 'ACME US Inc',
        amountRaw: 1_000_000n,
        amountFormatted: '1',
        txHash: '0xin',
      }),
    ])
    expect(rows).toHaveLength(2)
    const escrow = rows.find((r) => r.label === 'PaymentSettlement')
    const treasury = rows.find((r) => r.label === 'Treasury')
    expect(escrow?.outByToken.mockUSDC?.formatted).toBe('25000')
    expect(treasury?.inByToken.mockUSDC?.formatted).toBe('1')
  })
})
