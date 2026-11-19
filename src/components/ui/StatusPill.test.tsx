import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusPill } from './StatusPill'

describe('StatusPill', () => {
  it.each([
    ['success', 'Swap complete'],
    ['pending', 'Waiting'],
    ['failed', 'Reverted'],
  ] as const)('renders the %s variant', (status, label) => {
    render(<StatusPill status={status}>{label}</StatusPill>)
    const pill = screen.getByText(label)
    expect(pill).toHaveClass('status-pill', `status-pill-${status}`)
  })
})
