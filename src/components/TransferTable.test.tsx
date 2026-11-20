import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
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

  it('links ForteL2 hashes internally and Base hashes out to Basescan', () => {
    render(
      <MemoryRouter>
        <TransferTable
          items={items}
          self="0xFf489a6d49D68f9D0B564089C545C0768A33205f"
          networkId="fortel2-sepolia"
        />
      </MemoryRouter>,
    )

    const links = screen.getAllByRole('link')
    const txLinks = links.filter((a) =>
      a.getAttribute('href')?.includes('/fortel2-sepolia/tx/'),
    )
    expect(txLinks.length).toBeGreaterThanOrEqual(2)
    expect(
      links.filter((a) => a.getAttribute('href')?.includes('sepolia.basescan.org/tx/')),
    ).toHaveLength(0)
  })

  it('keeps Out for a self-send unless the address page opts in', () => {
    const self = '0xFf489a6d49D68f9D0B564089C545C0768A33205f'
    const selfSend: TimelineItem = {
      kind: 'native',
      networkId: 'fortel2-sepolia',
      from: self,
      to: self,
      fromLabel: 'ACME US Inc',
      toLabel: 'ACME US Inc',
      amountRaw: 0n,
      amountFormatted: '0',
      symbol: 'ETH',
      txHash: '0xselfsend',
      blockNumber: 3,
      timestamp: 1_700_000_200,
      method: '0x70a08231',
    }

    const { rerender } = render(
      <MemoryRouter>
        <TransferTable items={[selfSend]} self={self} networkId="fortel2-sepolia" />
      </MemoryRouter>,
    )
    expect(screen.getByText('Out')).toBeInTheDocument()
    expect(screen.getByText('ACME US Inc')).toBeInTheDocument()
    expect(screen.getByText(/Native ETH · 0x70a08231/)).toBeInTheDocument()

    rerender(
      <MemoryRouter>
        <TransferTable
          items={[selfSend]}
          self={self}
          networkId="fortel2-sepolia"
          presentation="list"
          markSelf
          decodeMethods
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('Self')).toBeInTheDocument()
    expect(screen.getByText('itself')).toBeInTheDocument()
    expect(screen.getByText(/Native ETH/)).toHaveTextContent('balanceOf')
    expect(screen.getByText(/0 ETH/)).toBeInTheDocument()
    expect(screen.queryByText('Out')).not.toBeInTheDocument()
  })

  it('names an unknown selector as a contract call and keeps the selector in a tooltip', () => {
    const self = '0xf8b8b3b58ebac9fc530d9244c22f391e90cc8ae2'
    render(
      <MemoryRouter>
        <TransferTable
          items={[
            {
              kind: 'native',
              networkId: 'fortel2-sepolia',
              from: self,
              to: '0x5128889F20Ec13e0Be38b2BeBC568594159B652d',
              fromLabel: self,
              toLabel: 'Operator',
              amountRaw: 0n,
              amountFormatted: '0',
              symbol: 'ETH',
              txHash: '0xselector',
              blockNumber: 4,
              timestamp: 1_700_000_300,
              method: '0x524e5231',
            },
          ]}
          self={self}
          networkId="fortel2-sepolia"
          presentation="list"
          decodeMethods
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Contract call' })).toBeInTheDocument()
    expect(screen.getByRole('tooltip')).toHaveTextContent('0x524e5231')
    expect(screen.getByText('Out')).toBeInTheDocument()
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
