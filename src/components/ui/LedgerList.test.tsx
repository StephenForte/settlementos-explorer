import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LedgerList } from './LedgerList'

const entries = [
  { id: 'out', label: 'To escrow', sub: 'ACME', amount: '−2', value: -2n },
  { id: 'in', label: 'Rebate', amount: '+1', value: 1n },
]

describe('LedgerList', () => {
  it('shows signed rows and a total when the sum matches the expected total', () => {
    render(<LedgerList entries={entries} expectedTotal={-1n} />)
    expect(screen.getByText('To escrow')).toBeInTheDocument()
    expect(screen.getByText('ACME')).toHaveClass('ledger-sub')
    expect(screen.getByText('−2')).toHaveClass('out')
    expect(screen.getByText('+1')).toHaveClass('in')
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('-1')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a reconciliation mismatch instead of hiding it', () => {
    render(<LedgerList entries={entries} expectedTotal={0n} formatTotal={(value) => `wei ${value}`} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('ledger-mismatch')
    expect(alert).toHaveTextContent('wei -1')
    expect(alert).toHaveTextContent('wei 0')
    expect(document.querySelector('.ledger-total .ledger-amount')).toHaveTextContent('wei -1')
  })
})
