import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getTransfers } from '../chain/transfers'
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
})
