import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatUnits } from 'viem'
import App from '../App'
import { getTransactionDetail, type TxLookup } from '../chain/transaction'

const HASH =
  '0x876325b24398a3b08bc1abd6901bced99b2ad7e254f427e7b6ef5817288045c7'
const OPERATOR = '0x5128889F20Ec13e0Be38b2BeBC568594159B652d'
const ESCROW = '0x9d8b8b7c476ab02306046f3da719d380fa0456aa'
const TREASURY = '0x1E4ee7a078Bd40d1982dF1978C046f8cD0D1D3AA'
const UNKNOWN = '0x000000000000000000000000000000000000dEaD'
const ACME = '0xF7842ac33AFF3dD3a6b195Dd366e7730771EBE5d'

vi.mock('../chain/transaction', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../chain/transaction')>()
  return {
    ...actual,
    getTransactionDetail: vi.fn(),
  }
})

const mockedGet = vi.mocked(getTransactionDetail)

function minedLookup(overrides: Partial<Extract<TxLookup, { status: 'mined' }>> = {}): TxLookup {
  const gasUsed = 49_387n
  const effectiveGasPrice = 1_000_251n
  return {
    status: 'mined',
    networkId: 'fortel2-sepolia',
    hash: HASH,
    from: OPERATOR,
    to: ESCROW,
    value: 0n,
    nonce: 30,
    input: `0xfc216bc9${'ab'.repeat(224)}`,
    gas: 54_383n,
    type: 'eip1559',
    blockNumber: 979_595n,
    transactionIndex: 1,
    timestamp: 1_786_642_114,
    confirmations: 44_788,
    receiptStatus: 'success',
    gasUsed,
    effectiveGasPrice,
    l2ExecutionFeeWei: gasUsed * effectiveGasPrice,
    contractAddress: null,
    logs: [
      {
        kind: 'erc20-transfer',
        address: '0x2066738d535681d28d0841cc2503c1c531d4d6aa',
        token: {
          address: '0x2066738d535681d28d0841cc2503c1c531d4d6aa',
          symbol: 'mockUSDC',
          decimals: 6,
        },
        from: ESCROW,
        to: TREASURY,
        fromLabel: 'PaymentSettlement',
        toLabel: 'Treasury',
        amountRaw: 100_000_000_000n,
        amountFormatted: '100000',
      },
      {
        kind: 'escrow',
        address: ESCROW,
        eventName: 'PaymentSettled',
        paymentId: `0x${'aa'.repeat(32)}`,
        detail: 'settled as mockJPY',
        amountRaw: 15_668_160n,
        amountFormatted: '15668160',
      },
    ],
    ...overrides,
  }
}

function renderTx(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

describe('TransactionPage', () => {
  beforeEach(() => {
    mockedGet.mockReset()
    mockedGet.mockResolvedValue({
      status: 'not_found',
      networkId: 'fortel2-sepolia',
      hash: HASH,
    })
  })

  it('issues zero getTransactionDetail calls for a malformed hash', () => {
    render(
      <MemoryRouter initialEntries={['/fortel2-sepolia/tx/not-a-hash']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Invalid transaction hash/i)).toBeInTheDocument()
    expect(mockedGet).not.toHaveBeenCalled()
    expect(screen.queryByLabelText(/RPC URL/i)).not.toBeInTheDocument()
  })

  it('shows a warn banner for not-found and does not mount RpcOverrideForm', async () => {
    mockedGet.mockResolvedValue({
      status: 'not_found',
      networkId: 'fortel2-sepolia',
      hash: HASH,
    })
    renderTx(`/fortel2-sepolia/tx/${HASH}`)

    const banner = await screen.findByRole('status')
    expect(banner).toHaveClass('tone-warn')
    expect(banner).toHaveTextContent(/not found/i)
    expect(banner).toHaveTextContent(/Base Sepolia/)
    expect(banner).toHaveTextContent(/Polygon Amoy/)
    expect(screen.queryByLabelText(/RPC URL/i)).not.toBeInTheDocument()
  })

  it('shows an error banner and RpcOverrideForm when the RPC is unreachable', async () => {
    mockedGet.mockRejectedValue(new Error('fetch failed'))
    renderTx(`/fortel2-sepolia/tx/${HASH}`)

    const banner = await screen.findByRole('status')
    expect(banner).toHaveClass('tone-error')
    expect(banner).toHaveTextContent(/RPC unavailable/i)
    expect(screen.getByLabelText(/RPC URL/i)).toBeInTheDocument()
  })

  it('renders pending without fee, status, or confirmation zeros', async () => {
    mockedGet.mockResolvedValue({
      status: 'pending',
      networkId: 'fortel2-sepolia',
      hash: HASH,
      from: OPERATOR,
      to: ESCROW,
      value: 0n,
      nonce: 30,
      input: '0x',
      gas: 54_383n,
      type: 'eip1559',
    })
    renderTx(`/fortel2-sepolia/tx/${HASH}`)

    expect(await screen.findByText(/Pending/i)).toBeInTheDocument()
    expect(screen.queryByText('L2 execution fee')).not.toBeInTheDocument()
    expect(screen.queryByText('Success')).not.toBeInTheDocument()
    expect(screen.queryByText('Failed')).not.toBeInTheDocument()
    expect(screen.queryByText('Confirmations')).not.toBeInTheDocument()
    expect(screen.getAllByText('Operator').length).toBeGreaterThan(0)
  })

  it('labels the fee row L2 execution fee and shows gasUsed × effectiveGasPrice in gwei', async () => {
    const gasUsed = 49_387n
    const effectiveGasPrice = 1_000_251n
    const feeWei = gasUsed * effectiveGasPrice
    mockedGet.mockResolvedValue(
      minedLookup({ gasUsed, effectiveGasPrice, l2ExecutionFeeWei: feeWei }),
    )
    renderTx(`/fortel2-sepolia/tx/${HASH}`)

    expect(await screen.findByText('L2 execution fee')).toBeInTheDocument()
    const independent = formatUnits(feeWei, 9)
    expect(screen.getByText(`${independent} gwei`)).toBeInTheDocument()
    expect(screen.getByText('Success')).toBeInTheDocument()
    expect(screen.getByText('979595')).toBeInTheDocument()
  })

  it('decodes PaymentSettled with labelled counterparties and leaves unknown logs raw', async () => {
    mockedGet.mockResolvedValue(
      minedLookup({
        logs: [
          {
            kind: 'escrow',
            address: ESCROW,
            eventName: 'PaymentSettled',
            paymentId: `0x${'aa'.repeat(32)}`,
            detail: 'settled as mockJPY',
            amountRaw: 15_668_160n,
            amountFormatted: '15668160',
          },
          {
            kind: 'erc20-transfer',
            address: '0x2066738d535681d28d0841cc2503c1c531d4d6aa',
            token: {
              address: '0x2066738d535681d28d0841cc2503c1c531d4d6aa',
              symbol: 'mockUSDC',
              decimals: 6,
            },
            from: ESCROW,
            to: TREASURY,
            fromLabel: 'PaymentSettlement',
            toLabel: 'Treasury',
            amountRaw: 100_000_000_000n,
            amountFormatted: '100000',
          },
          {
            kind: 'undecoded',
            address: UNKNOWN,
            topic0: `0x${'11'.repeat(32)}`,
            data: '0xdeadbeef',
          },
        ],
      }),
    )
    renderTx(`/fortel2-sepolia/tx/${HASH}`)

    expect(await screen.findByText('PaymentSettled')).toBeInTheDocument()
    expect(screen.getAllByText('PaymentSettlement').length).toBeGreaterThan(0)
    expect(screen.getByText('Treasury')).toBeInTheDocument()
    expect(screen.getByText('Not decoded')).toBeInTheDocument()
    expect(screen.getByText('0xdeadbeef')).toBeInTheDocument()
    expect(screen.queryByText('0.000000')).not.toBeInTheDocument()
  })

  it('renders a PaymentRefunded recipient when only toLabel is set', async () => {
    mockedGet.mockResolvedValue(
      minedLookup({
        logs: [
          {
            kind: 'escrow',
            address: ESCROW,
            eventName: 'PaymentRefunded',
            paymentId: `0x${'aa'.repeat(32)}`,
            to: ACME,
            toLabel: 'ACME US Inc',
            amountRaw: 100_000_000_000n,
            amountFormatted: '100000000000',
          },
        ],
      }),
    )
    renderTx(`/fortel2-sepolia/tx/${HASH}`)

    expect(await screen.findByText('PaymentRefunded')).toBeInTheDocument()
    const recipient = screen.getByRole('link', { name: 'ACME US Inc' })
    expect(recipient).toHaveAttribute(
      'href',
      `/fortel2-sepolia/address/${ACME}`,
    )
    expect(recipient.parentElement).toHaveTextContent(/^→\s*ACME US Inc$/)
  })

  it('resolves all three URL aliases onto the canonical ForteL2 path (D33)', async () => {
    mockedGet.mockResolvedValue({
      status: 'not_found',
      networkId: 'fortel2-sepolia',
      hash: HASH,
    })

    const paths = [
      `/tx/${HASH}?network=fortel2-sepolia`,
      `/tx/${HASH}?chainId=852`,
      `/tx/${HASH}`,
    ]
    for (const path of paths) {
      const { unmount } = renderTx(path)
      expect(
        await screen.findByRole('heading', { name: 'Transaction' }),
      ).toBeInTheDocument()
      expect(document.querySelector('.detail-header .eyebrow')).toHaveTextContent(
        'ForteL2 Sepolia',
      )
      unmount()
    }
  })

  it('resolves ?chainId=84532 onto Base Sepolia', async () => {
    mockedGet.mockResolvedValue({
      status: 'not_found',
      networkId: 'base-sepolia',
      hash: HASH,
    })
    renderTx(`/tx/${HASH}?chainId=84532`)
    expect(
      await screen.findByRole('heading', { name: 'Transaction' }),
    ).toBeInTheDocument()
    expect(document.querySelector('.detail-header .eyebrow')).toHaveTextContent(
      'Base Sepolia',
    )
  })

  it('shows a loading line while the lookup is in flight', () => {
    mockedGet.mockReturnValue(new Promise(() => {}))
    renderTx(`/fortel2-sepolia/tx/${HASH}`)
    expect(screen.getByText(/Loading transaction/i)).toBeInTheDocument()
  })
})
