import { afterEach, describe, expect, it, vi } from 'vitest'
import { cacheClear } from '../lib/cache'
import {
  aggregateFlows,
  annotateTransfer,
  counterpartySummary,
  getTransfers,
  onlyTransfers,
  type TransferEvent,
} from './transfers'

vi.mock('../lib/clients', () => ({
  getPublicClient: () => ({
    getBlockNumber: async () => 1000n,
    getLogs: async () => [],
    getBlock: async () => ({ timestamp: 1_700_000_000n }),
  }),
}))

afterEach(() => {
  cacheClear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
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
