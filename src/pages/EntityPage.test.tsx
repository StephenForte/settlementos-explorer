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

  it('links a Base row out to Basescan and a ForteL2 row internally in the same table', async () => {
    const baseHash =
      '0xabc1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd'
    const forteHash =
      '0x876325b24398a3b08bc1abd6901bced99b2ad7e254f427e7b6ef5817288045c7'

    mockedGetTransfers.mockImplementation(async (networkId) => {
      if (networkId === 'base-sepolia') {
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
              txHash: baseHash,
              blockNumber: 42,
              timestamp: 1_700_000_000,
            },
          ],
          source: 'explorer-api',
          truncated: false,
        }
      }
      if (networkId === 'fortel2-sepolia') {
        return {
          items: [
            {
              kind: 'transfer',
              networkId: 'fortel2-sepolia',
              from: '0xF7842ac33AFF3dD3a6b195Dd366e7730771EBE5d',
              to: '0x9d8b8b7c476ab02306046f3da719d380fa0456aa',
              fromLabel: 'ACME US Inc',
              toLabel: 'PaymentSettlement',
              token: {
                address: '0x2066738d535681d28d0841cc2503c1c531d4d6aa',
                symbol: 'mockUSDC',
                decimals: 6,
              },
              amountRaw: 100_000_000_000n,
              amountFormatted: '100000',
              txHash: forteHash,
              blockNumber: 979_595,
              timestamp: 1_786_642_114,
            },
          ],
          source: 'rpc-logs',
          truncated: false,
        }
      }
      return { items: [], source: 'explorer-api', truncated: false }
    })

    renderEntity('/entity/ent_acme_us')

    const mergedHeading = await screen.findByRole('heading', {
      name: 'Merged activity',
    })
    const mergedSection = mergedHeading.closest('section')
    expect(mergedSection).not.toBeNull()
    const links = Array.from(mergedSection!.querySelectorAll('a'))
    const hrefs = links.map((a) => a.getAttribute('href') ?? '')
    expect(hrefs.some((h) => h.includes(`sepolia.basescan.org/tx/${baseHash}`))).toBe(
      true,
    )
    expect(hrefs.some((h) => h === `/fortel2-sepolia/tx/${forteHash}`)).toBe(true)
  })
})
