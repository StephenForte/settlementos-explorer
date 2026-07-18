import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AddressBalances } from '../chain/balances'
import { OverviewPage } from './OverviewPage'

vi.mock('../chain/balances', () => ({
  getBalances: vi.fn(async (networkId: string, address: string) => {
    const balances: AddressBalances = {
      networkId: networkId as AddressBalances['networkId'],
      address,
      native: {
        symbol: 'ETH',
        raw: 1n,
        formatted: '0.001',
        status: 'ok',
      },
      tokens: [],
    }
    return balances
  }),
}))

function renderOverview(path = '/base-sepolia') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/:networkId" element={<OverviewPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('OverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the directory and filters by query', async () => {
    renderOverview()

    expect(
      screen.getByRole('heading', { name: /SettlementOS address directory/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('PaymentSettlement')).toBeInTheDocument()
    expect(screen.getAllByText('ACME US Inc').length).toBeGreaterThan(0)

    const input = screen.getByPlaceholderText(/Filter by label/i)
    await act(async () => {
      fireEvent.change(input, { target: { value: 'operator' } })
    })

    expect(
      screen.getByRole('link', { name: 'Operator' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('PaymentSettlement')).not.toBeInTheDocument()
    expect(screen.getByText(/1 of \d+ addresses/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getAllByText('0.001 ETH').length).toBeGreaterThan(0)
    })
  })

  it('loads balance chips for directory rows', async () => {
    renderOverview()
    await waitFor(() => {
      expect(screen.getAllByText('0.001 ETH').length).toBeGreaterThan(0)
    })
  })
})
