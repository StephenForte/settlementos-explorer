import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AddressBalances } from '../chain/balances'
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

describe('BalanceChips', () => {
  it('shows loading copy when balances are missing', () => {
    render(<BalanceChips balances={undefined} />)
    expect(screen.getByText(/Loading balances/i)).toBeInTheDocument()
  })

  it('renders ok and unavailable chips', () => {
    render(<BalanceChips balances={balances} />)
    expect(screen.getByText('0.001 ETH')).toBeInTheDocument()
    expect(screen.getByText('mockUSDC: unavailable')).toBeInTheDocument()
  })
})
