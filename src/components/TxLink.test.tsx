import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { TxLink } from './TxLink'

const HASH =
  '0x876325b24398a3b08bc1abd6901bced99b2ad7e254f427e7b6ef5817288045c7'

describe('TxLink', () => {
  it('links out to Basescan when the network has a public explorer', () => {
    render(
      <MemoryRouter>
        <TxLink networkId="base-sepolia" hash={HASH}>
          tx
        </TxLink>
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: 'tx' })
    expect(link).toHaveAttribute(
      'href',
      `https://sepolia.basescan.org/tx/${HASH}`,
    )
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('links internally when the network has no public explorer', () => {
    render(
      <MemoryRouter>
        <TxLink networkId="fortel2-sepolia" hash={HASH}>
          tx
        </TxLink>
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: 'tx' })
    expect(link).toHaveAttribute('href', `/fortel2-sepolia/tx/${HASH}`)
    expect(link).not.toHaveAttribute('target')
  })
})
