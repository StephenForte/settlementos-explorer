import { formatUnits } from 'viem'

/** Format raw token units with bigint math — never JS floats on raw units. */
export function formatTokenAmount(raw: bigint, decimals: number): string {
  const formatted = formatUnits(raw, decimals)
  if (decimals === 0) return formatted
  const [whole, frac = ''] = formatted.split('.')
  const trimmed = frac.replace(/0+$/, '').slice(0, Math.min(decimals, 6))
  return trimmed ? `${whole}.${trimmed}` : whole
}

export function formatNative(raw: bigint, decimals = 18): string {
  return formatTokenAmount(raw, decimals)
}

export function formatTimestamp(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '—'
  return new Date(seconds * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
