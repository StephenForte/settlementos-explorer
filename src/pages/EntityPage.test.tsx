import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getTransfers } from '../chain/transfers'
import type { NetworkId } from '../config/networks'
import { EntityPage } from './EntityPage'

vi.mock('../chain/balances', () => ({
  getBalances: vi.fn(async (networkId: NetworkId, address: string) => ({
    networkId,
    address,
    native: {
      symbol: 'ETH',
      raw: 1n,
      formatted: '0.001',
      status: 'ok' as const,
    },
    tokens: [],
  })),
}))

vi.mock('../chain/transfers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../chain/transfers')>()
  return {
    ...actual,
    getTransfers: vi.fn(async () => ({
      items: [],
      source: 'explorer-api' as const,
      truncated: false,
    })),
  }
})

const mockedGetTransfers = vi.mocked(getTransfers)

function renderEntity(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/entity/:entityId" element={<EntityPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('EntityPage', () => {
  beforeEach(() => {
    mockedGetTransfers.mockReset()
    mockedGetTransfers.mockResolvedValue({
      items: [],
      source: 'explorer-api',
      truncated: false,
    })
  })

  it('keeps merged Base/Amoy activity when one wallet history rejects', async () => {
    mockedGetTransfers.mockImplementation(async (networkId) => {
      if (networkId === 'fortel2-sepolia' || networkId === 'polygon-amoy') {
        throw new Error('sequencer unreachable')
      }
      return {
        items: [
          {
            kind: 'native',
            networkId: 'base-sepolia',
            from: '0xFf489a6d49D68f9D0B564089C545C0768A33205f',
            to: '0x565C39623D473fa5e9CdeffD5AA62a66f174Aaa8',
            fromLabel: 'ACME US Inc',
            toLabel: 'Tokyo Trading KK',
            amountRaw: 1_000_000_000_000_000n,
            amountFormatted: '0.001',
            symbol: 'ETH',
            txHash:
              '0xabc1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd',
            blockNumber: 42,
            timestamp: 1_700_000_000,
          },
        ],
        source: 'explorer-api',
        truncated: false,
      }
    })

    renderEntity('/entity/ent_acme_us')

    const mergedHeading = await screen.findByRole('heading', {
      name: 'Merged activity',
    })
    expect(mergedHeading).toBeInTheDocument()
    expect(
      await screen.findByText(/Partial history:.*Polygon Amoy unavailable/i),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText(/ACME US Inc → Tokyo Trading KK/).length,
    ).toBeGreaterThan(0)
    const mergedSection = mergedHeading.closest('section')
    expect(mergedSection).not.toBeNull()
    expect(mergedSection!).toHaveTextContent('Base Sepolia')
    expect(mergedSection!).toHaveTextContent('0.001 ETH')
    expect(mergedSection!).not.toHaveTextContent(/^sequencer unreachable$/m)
  })
})
