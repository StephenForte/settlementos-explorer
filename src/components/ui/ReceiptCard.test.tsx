import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReceiptCard } from './ReceiptCard'

describe('ReceiptCard', () => {
  it('renders the title, note, action, and body', () => {
    render(
      <ReceiptCard title="Paid Tokyo Trading" note="Final" action={<button type="button">Copy link</button>}>
        <p>Sent 10</p>
      </ReceiptCard>,
    )
    expect(screen.getByRole('heading', { name: 'Paid Tokyo Trading' })).toBeInTheDocument()
    expect(screen.getByText('Final')).toHaveClass('finality-note')
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument()
    expect(screen.getByText('Sent 10')).toBeInTheDocument()
  })

  it('marks a failed receipt without removing its content', () => {
    render(
      <ReceiptCard title="Reverted" tone="failed">
        <p>Nothing settled</p>
      </ReceiptCard>,
    )
    expect(screen.getByRole('article')).toHaveClass('receipt-card-failed')
    expect(screen.getByText('Nothing settled')).toBeInTheDocument()
  })
})
