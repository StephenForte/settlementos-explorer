import { afterEach, describe, expect, it, vi } from 'vitest'
import { cacheClear } from '../lib/cache'
import { getBalances } from './balances'

const getBalance = vi.fn()
const readContract = vi.fn()

vi.mock('../lib/clients', () => ({
  getPublicClient: () => ({
    getBalance,
    readContract,
  }),
}))

afterEach(() => {
  cacheClear()
  vi.clearAllMocks()
})

describe('getBalances', () => {
  it('returns native and token balances formatted with correct decimals', async () => {
    getBalance.mockResolvedValue(1_000_000_000_000_000n)
    readContract.mockResolvedValue(25_000_000_000n)

    const result = await getBalances(
      'base-sepolia',
      '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
    )

    expect(result.native.status).toBe('ok')
    expect(result.native.symbol).toBe('ETH')
    expect(result.native.formatted).toBe('0.001')
    expect(result.tokens).toHaveLength(3)
    expect(result.tokens.every((t) => t.status === 'ok')).toBe(true)
    expect(result.tokens.find((t) => t.token.symbol === 'mockUSDC')?.formatted).toBe(
      '25000',
    )
    // batched: one native + one call per token
    expect(readContract).toHaveBeenCalledTimes(3)
  })

  it('marks individual fields unavailable without throwing', async () => {
    getBalance.mockRejectedValue(new Error('RPC down'))
    readContract
      .mockResolvedValueOnce(100n)
      .mockRejectedValueOnce(new Error('token rpc fail'))
      .mockResolvedValueOnce(0n)

    const result = await getBalances(
      'polygon-amoy',
      '0x5128889F20Ec13e0Be38b2BeBC568594159B652d',
    )

    expect(result.native.status).toBe('unavailable')
    expect(result.native.error).toMatch(/RPC down/)
    expect(result.native.symbol).toBe('POL')
    expect(result.tokens.some((t) => t.status === 'ok')).toBe(true)
    expect(result.tokens.some((t) => t.status === 'unavailable')).toBe(true)
  })

  it('caches responses so repeated calls do not re-hit RPC', async () => {
    getBalance.mockResolvedValue(1n)
    readContract.mockResolvedValue(0n)

    const address = '0xFf489a6d49D68f9D0B564089C545C0768A33205f'
    await getBalances('base-sepolia', address)
    await getBalances('base-sepolia', address)

    expect(getBalance).toHaveBeenCalledTimes(1)
  })
})
