import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getBalances } from '../chain/balances'
import { getTransfers, type NativeTxEvent } from '../chain/transfers'
import { AddressDetailPage } from './AddressDetailPage'

vi.mock('../chain/balances', () => ({
  getBalances: vi.fn(async () => ({
    networkId: 'base-sepolia',
    address: '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
    native: {
      symbol: 'ETH',
      raw: 1n,
      formatted: '0.001',
      status: 'ok' as const,
    },
    tokens: [],
  })),
}))

vi.mock('../chain/transfers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../chain/transfers')>()
  return {
    ...actual,
    getTransfers: vi.fn(async () => ({
      items: [],
      source: 'explorer-api' as const,
      truncated: false,
    })),
  }
})

const mockedGetTransfers = vi.mocked(getTransfers)
const mockedGetBalances = vi.mocked(getBalances)

const selfNative = (overrides: Partial<NativeTxEvent> = {}): NativeTxEvent => ({
  kind: 'native',
  networkId: 'fortel2-sepolia',
  from: '0xf8b8b3b58ebac9fc530d9244c22f391e90cc8ae2',
  to: '0xf8b8b3b58ebac9fc530d9244c22f391e90cc8ae2',
  fromLabel: '0xf8b8…8ae2',
  toLabel: '0xf8b8…8ae2',
  amountRaw: 0n,
  amountFormatted: '0',
  symbol: 'ETH',
  txHash: '0xselfsend',
  blockNumber: 9,
  timestamp: 1_700_000_090,
  method: '0x524e5231',
  ...overrides,
})

function renderAddress(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/:networkId/address/:address"
          element={<AddressDetailPage />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AddressDetailPage', () => {
  beforeEach(() => {
    mockedGetBalances.mockReset()
    mockedGetBalances.mockResolvedValue({
      networkId: 'base-sepolia',
      address: '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
      native: {
        symbol: 'ETH',
        raw: 1n,
        formatted: '0.001',
        status: 'ok',
      },
      tokens: [],
    })
    mockedGetTransfers.mockReset()
    mockedGetTransfers.mockResolvedValue({
      items: [],
      source: 'explorer-api',
      truncated: false,
    })
  })

  it('rejects invalid network or address', () => {
    renderAddress('/not-a-network/address/0x123')
    expect(screen.getByText(/Invalid network or address/i)).toBeInTheDocument()
  })

  it('renders a known address label', async () => {
    renderAddress(
      '/base-sepolia/address/0xFf489a6d49D68f9D0B564089C545C0768A33205f',
    )
    expect(
      await screen.findByRole('heading', { name: 'ACME US Inc' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Entity')).toBeInTheDocument()
  })

  it('does not show explorer-outage copy for RPC-primary networks', async () => {
    mockedGetTransfers.mockResolvedValue({
      items: [],
      source: 'rpc-logs',
      truncated: true,
    })

    renderAddress(
      '/fortel2-sepolia/address/0xFf489a6d49D68f9D0B564089C545C0768A33205f',
    )

    expect(
      await screen.findByRole('heading', { name: 'Unknown address' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/explorer API unavailable/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/eth_getLogs fallback/i)).not.toBeInTheDocument()
  })

  it('shows explorer-outage copy when Etherscan networks fall back to RPC', async () => {
    mockedGetTransfers.mockResolvedValue({
      items: [],
      source: 'rpc-logs',
      truncated: true,
      error: 'Explorer API failed',
    })

    renderAddress(
      '/base-sepolia/address/0xFf489a6d49D68f9D0B564089C545C0768A33205f',
    )

    expect(
      await screen.findByText(/explorer API unavailable/i),
    ).toBeInTheDocument()
  })

  it('shows an error when transfer history loading rejects', async () => {
    mockedGetTransfers.mockRejectedValue(new Error('RPC history failed'))

    renderAddress(
      '/fortel2-sepolia/address/0xFf489a6d49D68f9D0B564089C545C0768A33205f',
    )

    expect(
      await screen.findByText(/Explorer \/ RPC history failed: RPC history failed/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/No recent transactions found/i),
    ).not.toBeInTheDocument()
  })

  it('shows an error for soft RPC failures without truncated fallback', async () => {
    mockedGetTransfers.mockResolvedValue({
      items: [],
      source: 'rpc-logs',
      truncated: false,
      error: 'eth_getLogs timed out',
    })

    renderAddress(
      '/fortel2-sepolia/address/0xFf489a6d49D68f9D0B564089C545C0768A33205f',
    )

    expect(
      await screen.findByText(
        /Explorer \/ RPC history failed: eth_getLogs timed out/i,
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/explorer API unavailable/i)).not.toBeInTheDocument()
  })

  it('shows a warning and keeps rows when RPC history is partial', async () => {
    mockedGetTransfers.mockResolvedValue({
      items: [
        {
          kind: 'native',
          networkId: 'fortel2-sepolia',
          from: '0x5128889F20Ec13e0Be38b2BeBC568594159B652d',
          to: '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
          fromLabel: 'Operator',
          toLabel: 'ACME US Inc',
          amountRaw: 1_000_000_000_000_000n,
          amountFormatted: '0.001',
          symbol: 'ETH',
          txHash: '0xnative-partial',
          blockNumber: 4,
          timestamp: 1_700_000_044,
        },
      ],
      source: 'rpc-logs',
      truncated: false,
      error: 'token history: eth_getLogs timed out',
    })

    renderAddress(
      '/fortel2-sepolia/address/0xFf489a6d49D68f9D0B564089C545C0768A33205f',
    )

    expect(
      await screen.findByText(/Partial history: token history/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/0xnative/i)).toBeInTheDocument()
    expect(
      screen.queryByText(/Explorer \/ RPC history failed/i),
    ).not.toBeInTheDocument()
  })

  it('puts a short sent-count coverage message above the activity list', async () => {
    mockedGetTransfers.mockResolvedValue({
      items: [],
      source: 'rpc-logs',
      truncated: false,
      coverage: {
        sent: { found: 0, expected: 13 },
        gaps: ['some historical account states were unavailable from the RPC'],
      },
    })

    renderAddress(
      '/fortel2-sepolia/address/0xf8b8b3b58ebac9fc530d9244c22f391e90cc8ae2',
    )

    const banner = await screen.findByTestId('coverage-banner')
    expect(banner).toHaveTextContent('Partial history. Showing 0 of 13 sent transactions.')
    expect(banner).toHaveTextContent(
      'Some historical account states were unavailable from the RPC.',
    )
    const activity = screen.getByRole('heading', { name: 'Activity' })
    expect(banner.compareDocumentPosition(activity) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(banner.closest('.details-panel')).toBeNull()
    expect(screen.queryByText(/No transactions found/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/No recent transactions/i)).not.toBeInTheDocument()
  })

  it('reads a self-send as Self and itself, and explains an empty counterparty list', async () => {
    mockedGetTransfers.mockResolvedValue({
      items: [selfNative()],
      source: 'rpc-logs',
      truncated: false,
      coverage: {
        sent: { found: 1, expected: 2 },
        gaps: ['the sent transaction count differs from the account nonce'],
      },
    })

    renderAddress(
      '/fortel2-sepolia/address/0xf8b8b3b58ebac9fc530d9244c22f391e90cc8ae2',
    )

    expect(await screen.findByText('Self')).toBeInTheDocument()
    expect(screen.getByText('itself')).toBeInTheDocument()
    expect(screen.queryByText('Out')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Contract call' })).toBeInTheDocument()
    expect(screen.getByRole('tooltip')).toHaveTextContent('0x524e5231')
    expect(screen.getByText(/0 ETH/)).toBeInTheDocument()
    expect(screen.getByTestId('coverage-banner')).toHaveTextContent(
      'Showing 1 of 2 sent transactions.',
    )
    expect(screen.getByTestId('coverage-banner')).toHaveTextContent(
      'The sent transaction count differs from the account nonce.',
    )
    expect(
      screen.getByText(/Self-sends are the only activity, so they are left out of counterparties/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/No counterparties yet/i)).not.toBeInTheDocument()
  })

  it('shows native rows that arrive before history finishes', async () => {
    mockedGetTransfers.mockImplementation(async (_network, _address, onProgress) => {
      onProgress?.([selfNative()])
      return new Promise(() => {})
    })

    renderAddress(
      '/fortel2-sepolia/address/0xf8b8b3b58ebac9fc530d9244c22f391e90cc8ae2',
    )

    expect(await screen.findByText('Self')).toBeInTheDocument()
    expect(screen.getByText(/Loading transactions/i)).toBeInTheDocument()
    expect(screen.queryByTestId('coverage-banner')).not.toBeInTheDocument()
  })

  it('keeps the balance error and RPC override form', async () => {
    mockedGetBalances.mockRejectedValue(new Error('rpc down'))

    renderAddress(
      '/base-sepolia/address/0xFf489a6d49D68f9D0B564089C545C0768A33205f',
    )

    expect(await screen.findByText(/RPC unavailable: rpc down/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Set RPC for Base Sepolia/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
