import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { Breadcrumbs } from './Breadcrumbs'

describe('Breadcrumbs', () => {
  it('links ancestors and marks the current crumb', () => {
    render(
      <MemoryRouter>
        <Breadcrumbs
          items={[
            { label: 'Transactions', href: '/base-sepolia' },
            { label: '3ae8jL…ShWURb' },
          ]}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Transactions' })).toHaveAttribute(
      'href',
      '/base-sepolia',
    )
    expect(screen.getByText('3ae8jL…ShWURb')).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('link', { name: '3ae8jL…ShWURb' })).not.toBeInTheDocument()
  })
})
