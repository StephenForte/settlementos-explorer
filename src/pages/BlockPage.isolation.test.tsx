import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { cacheClear, cacheSet } from '../lib/cache'

const BLOCK_HASH =
  '0x08fed8e2421fae5dfc513fa645518806e87dcbcbb155b4c81e98661d3dcf08cc'
const PARENT_HASH =
  '0x000306c145c4fd3dbc247a1f9104f8bce88d5fb47798a77ac5f84b9c67a9f6ad'
const SETTLEMENT_HASH =
  '0x876325b24398a3b08bc1abd6901bced99b2ad7e254f427e7b6ef5817288045c7'
const DEPOSIT_HASH =
  '0x1bafb919a9d9d838aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const OPERATOR = '0x5128889F20Ec13e0Be38b2BeBC568594159B652d'
const ESCROW = '0x9d8b8b7c476ab02306046f3da719d380fa0456aa'
const DEPOSITOR = '0xdeaddeaddeaddeaddeaddeaddeaddeaddead0001'
const L1_ATTRS = '0x4200000000000000000000000000000000000015'
const MINER = '0x4200000000000000000000000000000000000011'

const mocks = vi.hoisted(() => {
  const getBlock = vi.fn()
  const getBlockNumber = vi.fn()
  const getPublicClient = vi.fn(() => ({
    getBlock,
    getBlockNumber,
  }))
  return { getBlock, getBlockNumber, getPublicClient }
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
  }))
})

function renderBlock(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

describe('BlockPage cache isolation from F6u', () => {
  it('still renders full tx objects when block:{networkId}:{n} holds a header-only shape', async () => {
    cacheSet('block:fortel2-sepolia:979595', {
      number: 979_595n,
      hash: BLOCK_HASH,
      transactions: [DEPOSIT_HASH, SETTLEMENT_HASH],
    })
    mocks.getBlock.mockResolvedValue({
      number: 979_595n,
      hash: BLOCK_HASH,
      parentHash: PARENT_HASH,
      timestamp: 1_786_642_114n,
      gasUsed: 106_805n,
      gasLimit: 60_000_000n,
      baseFeePerGas: 251n,
      miner: MINER,
      transactions: [
        {
          hash: DEPOSIT_HASH,
          from: DEPOSITOR,
          to: L1_ATTRS,
          value: 0n,
          type: undefined,
        },
        {
          hash: SETTLEMENT_HASH,
          from: OPERATOR,
          to: ESCROW,
          value: 0n,
          type: 'eip1559',
        },
      ],
    })
    mocks.getBlockNumber.mockResolvedValue(1_025_580n)

    renderBlock('/fortel2-sepolia/block/979595')

    expect(
      await screen.findByRole('link', { name: 'Operator' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'PaymentSettlement' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: SETTLEMENT_HASH }),
    ).toHaveAttribute('href', `/fortel2-sepolia/tx/${SETTLEMENT_HASH}`)
    expect(mocks.getBlock).toHaveBeenCalledWith({
      blockNumber: 979_595n,
      includeTransactions: true,
    })
    expect(mocks.getBlock).toHaveBeenCalledTimes(1)
    expect(mocks.getBlockNumber).toHaveBeenCalledTimes(1)
  })
})
