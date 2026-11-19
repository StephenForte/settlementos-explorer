import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DetailsPanel } from './DetailsPanel'

const rows = [
  { id: 'hash', label: 'Hash', value: '0xabc', sub: 'Base Sepolia' },
  { id: 'nonce', label: 'Nonce', value: '4' },
]

describe('DetailsPanel', () => {
  it('shows label, value, and sub-line when open', () => {
    render(<DetailsPanel rows={rows} />)
    expect(screen.getByRole('button', { name: 'Technical details' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByText('Hash')).toBeInTheDocument()
    expect(screen.getByText('0xabc')).toBeInTheDocument()
    expect(screen.getByText('Base Sepolia')).toHaveClass('details-sub')
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('collapses and reopens the rows', () => {
    render(<DetailsPanel rows={rows} defaultOpen={false} />)
    const button = screen.getByRole('button', { name: 'Technical details' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('0xabc')).not.toBeInTheDocument()
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('0xabc')).toBeInTheDocument()
    fireEvent.click(button)
    expect(screen.queryByText('0xabc')).not.toBeInTheDocument()
  })
})
