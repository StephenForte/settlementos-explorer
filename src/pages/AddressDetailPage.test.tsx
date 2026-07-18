import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
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
})
