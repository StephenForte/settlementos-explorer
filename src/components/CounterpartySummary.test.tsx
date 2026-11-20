import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { TimelineItem } from '../chain/transfers'
import { CounterpartySummary } from './CounterpartySummary'

const self = '0xf8b8b3b58ebac9fc530d9244c22f391e90cc8ae2'
const other = '0x5128889F20Ec13e0Be38b2BeBC568594159B652d'

const selfSend: TimelineItem = {
  kind: 'native',
  networkId: 'fortel2-sepolia',
  from: self,
  to: self,
  fromLabel: '0xf8b8…8ae2',
  toLabel: '0xf8b8…8ae2',
  amountRaw: 0n,
  amountFormatted: '0',
  symbol: 'ETH',
  txHash: '0xself',
  blockNumber: 1,
  timestamp: 1_700_000_000,
}

const tokenOut: TimelineItem = {
  kind: 'transfer',
  networkId: 'fortel2-sepolia',
  from: self,
  to: other,
  fromLabel: '0xf8b8…8ae2',
  toLabel: 'Operator',
  token: {
    address: '0x2066738d535681d28d0841cc2503c1c531d4d6aa',
    symbol: 'mockUSDC',
    decimals: 6,
  },
  amountRaw: 1_000_000n,
  amountFormatted: '1',
  txHash: '0xtoken',
  blockNumber: 2,
  timestamp: 1_700_000_100,
}

describe('CounterpartySummary', () => {
  it('says when self-sends are the only activity', () => {
    render(
      <MemoryRouter>
        <CounterpartySummary address={self} items={[selfSend]} networkId="fortel2-sepolia" />
      </MemoryRouter>,
    )
    expect(
      screen.getByText(/Self-sends are the only activity, so they are left out of counterparties/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/No counterparties yet/i)).not.toBeInTheDocument()
  })

  it('leaves self-sends out and keeps the other counterparty', () => {
    render(
      <MemoryRouter>
        <CounterpartySummary
          address={self}
          items={[selfSend, tokenOut]}
          networkId="fortel2-sepolia"
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('Operator')).toBeInTheDocument()
    expect(screen.getByText(/Out 1 mockUSDC/)).toBeInTheDocument()
    expect(screen.queryByText('itself')).not.toBeInTheDocument()
    expect(screen.queryByText(/only activity/i)).not.toBeInTheDocument()
  })

  it('keeps the empty copy when there is no activity', () => {
    render(
      <MemoryRouter>
        <CounterpartySummary address={self} items={[]} networkId="fortel2-sepolia" />
      </MemoryRouter>,
    )
    expect(screen.getByText(/No counterparties yet/i)).toBeInTheDocument()
  })
})
