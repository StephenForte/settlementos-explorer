import { afterEach, describe, expect, it, vi } from 'vitest'
import { annotateTransfer, getTransfers } from './transfers'
import { cacheClear } from '../lib/cache'

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
  it('parses explorer API happy path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
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
        }),
      })),
    )

    const result = await getTransfers(
      'base-sepolia',
      '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
    )
    expect(result.source).toBe('explorer-api')
    expect(result.truncated).toBe(false)
    const transfer = result.items.find((i) => i.kind === 'transfer')
    expect(transfer?.kind).toBe('transfer')
    if (transfer?.kind === 'transfer') {
      expect(transfer.fromLabel).toBe('ACME US Inc')
      expect(transfer.toLabel).toBe('PaymentSettlement')
      expect(transfer.amountFormatted).toBe('25000')
    }
  })

  it('falls back to RPC logs when explorer API errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
      })),
    )

    const result = await getTransfers(
      'base-sepolia',
      '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
    )
    expect(result.source).toBe('rpc-logs')
    expect(result.truncated).toBe(true)
    expect(result.error).toMatch(/Explorer API/)
  })
})
