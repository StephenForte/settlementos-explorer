import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TermTooltip } from './TermTooltip'

describe('TermTooltip', () => {
  it('exposes a keyboard-focusable trigger and a dotted-underline tooltip', () => {
    render(<TermTooltip term="Nonce" definition="Sender transaction count before this one." />)
    const trigger = screen.getByRole('button', { name: 'Nonce' })
    expect(trigger).toHaveClass('term-trigger')
    expect(trigger.tagName).toBe('BUTTON')
    const tooltip = document.getElementById(trigger.getAttribute('aria-describedby') ?? '')
    expect(tooltip).not.toBeNull()
    expect(tooltip).toHaveAttribute('role', 'tooltip')
    expect(tooltip).toHaveTextContent('Sender transaction count before this one.')
  })
})
