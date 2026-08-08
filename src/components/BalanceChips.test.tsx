import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AddressBalances } from '../chain/balances'
import { clearNetworkRpcOverride } from '../lib/clients'
import { RPC_OVERRIDE_STORAGE_KEY } from '../lib/rpc-overrides'
import { BalanceChips } from './BalanceChips'

const balances: AddressBalances = {
  networkId: 'base-sepolia',
  address: '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
  native: {
    symbol: 'ETH',
    raw: 1n,
    formatted: '0.001',
    status: 'ok',
  },
  tokens: [
    {
      token: {
        address: '0x2066738d535681d28d0841cc2503c1c531d4d6aa',
        symbol: 'mockUSDC',
        decimals: 6,
      },
      raw: null,
      formatted: null,
      status: 'unavailable',
      error: 'RPC error',
    },
  ],
}

afterEach(() => {
  localStorage.removeItem(RPC_OVERRIDE_STORAGE_KEY)
  clearNetworkRpcOverride('base-sepolia')
})

describe('BalanceChips', () => {
  it('shows skeleton chips when balances are missing', () => {
    render(<BalanceChips balances={undefined} />)
    expect(screen.getByLabelText(/Loading balances/i)).toBeInTheDocument()
    expect(document.querySelectorAll('.chip-skeleton')).toHaveLength(3)
  })

  it('renders ok and unavailable chips', () => {
    render(<BalanceChips balances={balances} />)
    expect(screen.getByText('0.001 ETH')).toBeInTheDocument()
    expect(screen.getByText('mockUSDC: unavailable')).toBeInTheDocument()
    expect(screen.queryByText(/Set RPC/i)).not.toBeInTheDocument()
  })

  it('offers an RPC override control when networkId is set and a chip is unavailable', () => {
    const onRpcOverrideChange = vi.fn()
    render(
      <BalanceChips
        balances={balances}
        networkId="base-sepolia"
        onRpcOverrideChange={onRpcOverrideChange}
      />,
    )

    expect(
      screen.getByRole('button', { name: /Set RPC for Base Sepolia/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Addresses you view will be sent to this host/i),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/RPC URL/i), {
      target: { value: 'https://base-override.example/rpc' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Save RPC/i }))
    expect(onRpcOverrideChange).toHaveBeenCalledTimes(1)
  })
})
