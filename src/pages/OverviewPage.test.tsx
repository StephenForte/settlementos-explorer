import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AddressBalances } from '../chain/balances'
import { getBalances } from '../chain/balances'
import { getAddressesForNetwork } from '../config/address-book'
import {
  clearNetworkRpcOverride,
  resolveRpcUrls,
} from '../lib/clients'
import { RPC_OVERRIDE_STORAGE_KEY } from '../lib/rpc-overrides'
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

const mockedGetBalances = vi.mocked(getBalances)

function unavailableBalances(
  networkId: string,
  address: string,
): AddressBalances {
  return {
    networkId: networkId as AddressBalances['networkId'],
    address,
    native: {
      symbol: 'ETH',
      raw: 0n,
      formatted: '0',
      status: 'unavailable',
      error: 'RPC failed',
    },
    tokens: [],
  }
}

function renderOverview(path = '/base-sepolia') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/:networkId" element={<OverviewPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function waitForInitialFetch(entryCount: number) {
  await waitFor(() => {
    expect(mockedGetBalances).toHaveBeenCalledTimes(entryCount)
  })
}

describe('OverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.removeItem(RPC_OVERRIDE_STORAGE_KEY)
    clearNetworkRpcOverride('base-sepolia')
  })

  afterEach(() => {
    localStorage.removeItem(RPC_OVERRIDE_STORAGE_KEY)
    clearNetworkRpcOverride('base-sepolia')
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

  it('shows a page-level RPC override with the privacy notice when rows are unavailable', async () => {
    mockedGetBalances.mockImplementation(async (networkId, address) =>
      unavailableBalances(networkId, address),
    )

    renderOverview()

    await waitFor(() => {
      expect(screen.getAllByText(/ETH: unavailable/i).length).toBeGreaterThan(0)
    })

    expect(
      screen.getByRole('region', { name: /RPC endpoint override/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Addresses you view will be sent to this host/i),
    ).toBeInTheDocument()
    // One page-level control — not one per directory row.
    expect(
      screen.getAllByRole('button', { name: /Set RPC for Base Sepolia/i }),
    ).toHaveLength(1)
  })

  it('saving an override refreshes balances exactly once; filtering does not refetch', async () => {
    const entryCount = getAddressesForNetwork('base-sepolia').length
    mockedGetBalances.mockImplementation(async (networkId, address) =>
      unavailableBalances(networkId, address),
    )

    renderOverview()
    await waitForInitialFetch(entryCount)

    await waitFor(() => {
      expect(
        screen.getByText(/Addresses you view will be sent to this host/i),
      ).toBeInTheDocument()
    })

    // Typing in the filter must not start another fetch round.
    const input = screen.getByPlaceholderText(/Filter by label/i)
    await act(async () => {
      fireEvent.change(input, { target: { value: 'operator' } })
    })
    expect(mockedGetBalances).toHaveBeenCalledTimes(entryCount)

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/RPC URL/i), {
        target: { value: 'https://custom-base.example/rpc' },
      })
      fireEvent.click(screen.getByRole('button', { name: /Save RPC/i }))
    })

    expect(resolveRpcUrls('base-sepolia')).toEqual([
      'https://custom-base.example/rpc',
    ])

    // Exactly one refresh round — entryCount more calls, then stop.
    await waitFor(() => {
      expect(mockedGetBalances).toHaveBeenCalledTimes(entryCount * 2)
    })
    // Settle: give any runaway effect a chance to fire extra calls.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(mockedGetBalances).toHaveBeenCalledTimes(entryCount * 2)
  })

  it('clearing the override also refreshes balances once', async () => {
    const entryCount = getAddressesForNetwork('base-sepolia').length
    mockedGetBalances.mockImplementation(async (networkId, address) =>
      unavailableBalances(networkId, address),
    )

    renderOverview()
    await waitForInitialFetch(entryCount)

    await waitFor(() => {
      expect(screen.getByLabelText(/RPC URL/i)).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/RPC URL/i), {
        target: { value: 'https://temp-base.example/rpc' },
      })
      fireEvent.click(screen.getByRole('button', { name: /Save RPC/i }))
    })
    await waitFor(() => {
      expect(mockedGetBalances).toHaveBeenCalledTimes(entryCount * 2)
    })

    const urlsWhileOverridden = resolveRpcUrls('base-sepolia')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Use default/i }))
    })

    await waitFor(() => {
      expect(mockedGetBalances).toHaveBeenCalledTimes(entryCount * 3)
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(mockedGetBalances).toHaveBeenCalledTimes(entryCount * 3)
    expect(resolveRpcUrls('base-sepolia')).not.toEqual(urlsWhileOverridden)
    expect(resolveRpcUrls('base-sepolia')[0]).not.toBe(
      'https://temp-base.example/rpc',
    )
  })

  it('resets progress counters when an override triggers a reload', async () => {
    const entryCount = getAddressesForNetwork('base-sepolia').length
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let call = 0

    mockedGetBalances.mockImplementation(async (networkId, address) => {
      call += 1
      if (call > entryCount) {
        await gate
      }
      return unavailableBalances(networkId, address)
    })

    renderOverview()
    await waitForInitialFetch(entryCount)
    await waitFor(() => {
      expect(screen.getByText(/Balances as of/i)).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/RPC URL/i), {
        target: { value: 'https://slow-base.example/rpc' },
      })
      fireEvent.click(screen.getByRole('button', { name: /Save RPC/i }))
    })

    // Counters must reset — not stay at "N of N loaded" while rows are blank.
    await waitFor(() => {
      expect(
        screen.getByText(new RegExp(`Loading balances 0/${entryCount}`)),
      ).toBeInTheDocument()
    })

    release()
    await waitFor(() => {
      expect(screen.getByText(/Balances as of/i)).toBeInTheDocument()
    })
  })
})
