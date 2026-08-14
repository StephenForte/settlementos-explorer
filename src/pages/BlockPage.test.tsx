import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { getBlockDetail, type BlockLookup } from '../chain/block'
import { cacheClear } from '../lib/cache'

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

vi.mock('../chain/block', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../chain/block')>()
  return {
    ...actual,
    getBlockDetail: vi.fn(),
  }
})

const mockedGet = vi.mocked(getBlockDetail)

function foundLookup(
  overrides: Partial<Extract<BlockLookup, { status: 'found' }>> = {},
): BlockLookup {
  return {
    status: 'found',
    networkId: 'fortel2-sepolia',
    queried: '979595',
    number: 979_595n,
    hash: BLOCK_HASH,
    parentHash: PARENT_HASH,
    timestamp: 1_786_642_114,
    gasUsed: 106_805n,
    gasLimit: 60_000_000n,
    baseFeePerGas: 251n,
    miner: MINER,
    head: 1_025_580n,
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
    ...overrides,
  }
}

function renderBlock(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

describe('BlockPage', () => {
  beforeEach(() => {
    cacheClear()
    mockedGet.mockReset()
    mockedGet.mockResolvedValue({
      status: 'not_found',
      networkId: 'fortel2-sepolia',
      queried: '979595',
    })
  })

  it('issues zero getBlockDetail calls for a malformed param', () => {
    renderBlock('/fortel2-sepolia/block/not-a-block')
    expect(screen.getByText(/Invalid block/i)).toBeInTheDocument()
    expect(mockedGet).not.toHaveBeenCalled()
    expect(screen.queryByLabelText(/RPC URL/i)).not.toBeInTheDocument()
  })

  it('shows a warn banner for not-found and does not mount RpcOverrideForm', async () => {
    mockedGet.mockResolvedValue({
      status: 'not_found',
      networkId: 'fortel2-sepolia',
      queried: '9999999',
    })
    renderBlock('/fortel2-sepolia/block/9999999')

    const banner = await screen.findByRole('status')
    expect(banner).toHaveClass('tone-warn')
    expect(banner).toHaveTextContent(/not found/i)
    expect(banner).toHaveTextContent(/may not have this block yet/i)
    expect(screen.queryByLabelText(/RPC URL/i)).not.toBeInTheDocument()
  })

  it('shows an error banner and RpcOverrideForm when the RPC is unreachable', async () => {
    mockedGet.mockRejectedValue(new Error('fetch failed'))
    renderBlock('/fortel2-sepolia/block/979595')

    const banner = await screen.findByRole('status')
    expect(banner).toHaveClass('tone-error')
    expect(banner).toHaveTextContent(/RPC unavailable/i)
    expect(screen.getByLabelText(/RPC URL/i)).toBeInTheDocument()
  })

  it('disables next when block == head, enables it at head - 1, and disables prev at block 0', async () => {
    mockedGet.mockResolvedValue(foundLookup({ number: 100n, head: 100n }))
    const atHead = renderBlock('/fortel2-sepolia/block/100')
    expect(await screen.findByRole('button', { name: 'Next' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute(
      'href',
      '/fortel2-sepolia/block/99',
    )
    atHead.unmount()

    mockedGet.mockResolvedValue(foundLookup({ number: 99n, head: 100n }))
    const beforeHead = renderBlock('/fortel2-sepolia/block/99')
    expect(await screen.findByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      '/fortel2-sepolia/block/100',
    )
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    beforeHead.unmount()

    mockedGet.mockResolvedValue(
      foundLookup({ number: 0n, head: 100n, parentHash: `0x${'00'.repeat(32)}` }),
    )
    renderBlock('/fortel2-sepolia/block/0')
    expect(await screen.findByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      '/fortel2-sepolia/block/1',
    )
  })

  it('renders a deposit tx with type undefined as a real row without the string undefined', async () => {
    mockedGet.mockResolvedValue(foundLookup())
    renderBlock('/fortel2-sepolia/block/979595')

    expect(await screen.findByRole('link', { name: DEPOSIT_HASH })).toHaveAttribute(
      'href',
      `/fortel2-sepolia/tx/${DEPOSIT_HASH}`,
    )
    const settlementLink = screen.getByRole('link', { name: SETTLEMENT_HASH })
    expect(settlementLink).toHaveAttribute(
      'href',
      `/fortel2-sepolia/tx/${SETTLEMENT_HASH}`,
    )
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('eip1559')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('undefined')
  })

  it('renders from/to/value of the block\'s full transaction objects', async () => {
    mockedGet.mockResolvedValue(foundLookup())
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
  })

  it('renders the same block for a number param and a hash param', async () => {
    mockedGet.mockResolvedValue(foundLookup())

    const byNumber = renderBlock('/fortel2-sepolia/block/979595')
    expect(await screen.findAllByText(BLOCK_HASH)).not.toHaveLength(0)
    expect(screen.getAllByText('979595').length).toBeGreaterThan(0)
    byNumber.unmount()

    mockedGet.mockResolvedValue(foundLookup({ queried: BLOCK_HASH }))
    renderBlock(`/fortel2-sepolia/block/${BLOCK_HASH}`)
    expect(await screen.findAllByText(BLOCK_HASH)).not.toHaveLength(0)
    expect(screen.getAllByText('979595').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: SETTLEMENT_HASH })).toBeInTheDocument()
  })

  it('shows a loading line while the lookup is in flight', () => {
    mockedGet.mockReturnValue(new Promise(() => {}))
    renderBlock('/fortel2-sepolia/block/979595')
    expect(screen.getByText(/Loading block/i)).toBeInTheDocument()
  })

  it('labels the miner through the address book and leaves the 0x4200…0011 recipient unlabelled', async () => {
    mockedGet.mockResolvedValue(foundLookup())
    renderBlock('/fortel2-sepolia/block/979595')

    expect(await screen.findByText('Fee recipient')).toBeInTheDocument()
    expect(screen.getByText(MINER)).toBeInTheDocument()
    expect(screen.getAllByText('External').length).toBeGreaterThan(0)
    expect(screen.getByText(/251 wei/)).toBeInTheDocument()
    expect(screen.getByText(/106805 \/ 60000000/)).toBeInTheDocument()
  })
})
