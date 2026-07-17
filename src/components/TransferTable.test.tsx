import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { TimelineItem } from '../chain/transfers'
import { TransferTable } from './TransferTable'

const items: TimelineItem[] = [
  {
    kind: 'transfer',
    networkId: 'base-sepolia',
    from: '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
    to: '0x9d8b8b7c476ab02306046f3da719d380fa0456aa',
    fromLabel: 'ACME US Inc',
    toLabel: 'PaymentSettlement',
    token: {
      address: '0x2066738d535681d28d0841cc2503c1c531d4d6aa',
      symbol: 'mockUSDC',
      decimals: 6,
    },
    amountRaw: 25_000_000_000n,
    amountFormatted: '25000',
    txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    blockNumber: 1,
    timestamp: 1_700_000_000,
  },
  {
    kind: 'native',
    networkId: 'base-sepolia',
    from: '0x5128889F20Ec13e0Be38b2BeBC568594159B652d',
    to: '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
    fromLabel: 'Operator',
    toLabel: 'ACME US Inc',
    amountRaw: 1_000_000_000_000_000n,
    amountFormatted: '0.001',
    symbol: 'ETH',
    txHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    blockNumber: 2,
    timestamp: 1_700_000_100,
  },
]

describe('TransferTable', () => {
  it('renders token and native rows with explorer links', () => {
    render(
      <MemoryRouter>
        <TransferTable
          items={items}
          self="0xFf489a6d49D68f9D0B564089C545C0768A33205f"
          networkId="base-sepolia"
        />
      </MemoryRouter>,
    )

    expect(screen.getByText('PaymentSettlement')).toBeInTheDocument()
    expect(screen.getByText(/25000 mockUSDC/)).toBeInTheDocument()
    expect(screen.getByText(/Native ETH/)).toBeInTheDocument()
    expect(screen.getByText('Operator')).toBeInTheDocument()

    const links = screen.getAllByRole('link')
    const txLinks = links.filter((a) =>
      a.getAttribute('href')?.includes('sepolia.basescan.org/tx/'),
    )
    expect(txLinks.length).toBeGreaterThanOrEqual(2)
  })

  it('shows empty state when there is no activity', () => {
    render(
      <MemoryRouter>
        <TransferTable
          items={[]}
          self="0xFf489a6d49D68f9D0B564089C545C0768A33205f"
          networkId="base-sepolia"
        />
      </MemoryRouter>,
    )
    expect(screen.getByText(/No recent transactions/i)).toBeInTheDocument()
  })
})
