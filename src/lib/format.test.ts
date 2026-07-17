import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText, formatNative, formatTimestamp, formatTokenAmount } from './format'

describe('formatTokenAmount', () => {
  it('formats mockUSDC (6 decimals) without trailing zeros', () => {
    expect(formatTokenAmount(25_000_000_000n, 6)).toBe('25000')
    expect(formatTokenAmount(12_500_000n, 6)).toBe('12.5')
  })

  it('formats mockJPY with zero decimals as whole units', () => {
    expect(formatTokenAmount(3_750_000n, 0)).toBe('3750000')
  })

  it('uses bigint math for large values', () => {
    expect(formatTokenAmount(1_000_000_000_000_000n, 6)).toBe('1000000000')
  })
})

describe('formatNative', () => {
  it('formats wei to ETH/POL', () => {
    expect(formatNative(1_000_000_000_000_000n)).toBe('0.001')
  })
})

describe('formatTimestamp', () => {
  it('returns em dash for missing timestamps', () => {
    expect(formatTimestamp(null)).toBe('—')
    expect(formatTimestamp(0)).toBe('—')
  })

  it('formats unix seconds as a locale string', () => {
    const out = formatTimestamp(1_700_000_000)
    expect(out).not.toBe('—')
    expect(out.length).toBeGreaterThan(4)
  })
})

describe('copyText', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns true when clipboard write succeeds', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn(async () => undefined) },
    })
    await expect(copyText('0xabc')).resolves.toBe(true)
  })

  it('returns false when clipboard write fails', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn(async () => {
          throw new Error('denied')
        }),
      },
    })
    await expect(copyText('0xabc')).resolves.toBe(false)
  })
})
