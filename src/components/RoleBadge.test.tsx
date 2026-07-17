import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RoleBadge } from './RoleBadge'

describe('RoleBadge', () => {
  it('renders the human-readable role label', () => {
    render(<RoleBadge role="escrow-contract" />)
    expect(screen.getByText('Escrow')).toBeInTheDocument()
    expect(screen.getByText('Escrow').className).toContain('role-escrow-contract')
  })
})
