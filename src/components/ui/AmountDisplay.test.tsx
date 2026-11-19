import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AmountDisplay } from './AmountDisplay'

describe('AmountDisplay', () => {
  it('renders the figure, unit, and sub-line', () => {
    render(<AmountDisplay label="Sent" amount="10,000" unit="mockUSDC" sub="6 decimals" />)
    expect(screen.getByText('Sent')).toBeInTheDocument()
    expect(screen.getByText('10,000')).toHaveClass('amount-value')
    expect(screen.getByText('mockUSDC')).toHaveClass('amount-unit')
    expect(screen.getByText('6 decimals')).toHaveClass('amount-sub')
  })

  it('omits the sub-line when none is passed', () => {
    render(<AmountDisplay amount="1" unit="wei" />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.queryByText(/decimals/)).not.toBeInTheDocument()
    expect(document.querySelector('.amount-sub')).toBeNull()
  })
})
