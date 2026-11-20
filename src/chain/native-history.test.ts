import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { discoverNativeHistory, type createNativeHistoryClient } from './native-history'

const ARCHIVE_GAP = 'some historical account states were unavailable from the RPC'

type HistoryClient = ReturnType<typeof createNativeHistoryClient>

describe('discoverNativeHistory', () => {
  it('records an archive gap when bisection pivots around a failing height are exhausted', async () => {
    const tip = 4n
    const failing = new Set<bigint>()
    const getBlock = vi.fn()
    const client = {
      getBlockNumber: async () => tip,
      getTransactionCount: async ({ blockNumber }: { blockNumber?: bigint }) => {
        if (blockNumber === 0n) return 0
        if (blockNumber === tip) return 1
        failing.add(blockNumber ?? -1n)
        throw new Error('missing trie node')
      },
      getBalance: async ({ blockNumber }: { blockNumber?: bigint }) => {
        if (blockNumber === 0n || blockNumber === tip) return 0n
        throw new Error('missing trie node')
      },
      getBlock,
    }

    const result = await discoverNativeHistory(
      client as unknown as HistoryClient,
      '0xf8b8b3b58ebac9fc530d9244c22f391e90cc8ae2' as Address,
      () => {},
    )

    expect(getBlock).not.toHaveBeenCalled()
    expect([...failing].some((height) => height > 0n && height < tip)).toBe(true)
    expect(result.expected).toBe(1)
    expect(result.problems).toEqual([ARCHIVE_GAP])
  })
})
