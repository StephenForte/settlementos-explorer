import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RoleBadge } from './RoleBadge'

describe('RoleBadge', () => {
  it('renders the human-readable role label', () => {
    render(<RoleBadge role="escrow-contract" />)
    expect(screen.getByText('Escrow')).toBeInTheDocument()
    expect(screen.getByText('Escrow').className).toContain('role-escrow-contract')
  })

  it('styles the mmf-contract role with a dedicated class shared by graph nodes', () => {
    render(<RoleBadge role="mmf-contract" />)
    const badge = screen.getByText('Tokenized MMF')
    expect(badge.className).toContain('role-badge')
    expect(badge.className).toContain('role-mmf-contract')
  })
})
