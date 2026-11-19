import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { describe, expect, it } from 'vitest'

function slice(css: string, start: string, end: string): string {
  const from = css.indexOf(start)
  const to = css.indexOf(end, from + start.length)
  if (from < 0 || to < 0) throw new Error(`missing marker ${start}`)
  return css.slice(from + start.length, to)
}

function props(block: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const match of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    map.set(match[1], match[2].trim())
  }
  return map
}

function channel(value: number): number {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const h = hex.slice(1)
  const r = Number.parseInt(h.slice(0, 2), 16)
  const g = Number.parseInt(h.slice(2, 4), 16)
  const b = Number.parseInt(h.slice(4, 6), 16)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background))
  const darker = Math.min(luminance(foreground), luminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

function resolve(map: Map<string, string>, name: string, depth = 0): string {
  if (depth > 8) throw new Error(`alias cycle at --${name}`)
  const raw = map.get(name)
  if (!raw) throw new Error(`missing --${name}`)
  const alias = /^var\(--([a-z0-9-]+)\)$/.exec(raw)
  if (alias) return resolve(map, alias[1], depth + 1)
  if (!/^#[0-9a-fA-F]{6}$/.test(raw)) throw new Error(`--${name} is not a hex colour (${raw})`)
  return raw.toLowerCase()
}

/** Text/background pairs the stylesheet and the receipt primitives actually paint. */
const TEXT_PAIRS: [string, string][] = [
  ['ink', 'canvas'],
  ['ink', 'surface-card'],
  ['ink', 'surface-soft'],
  ['ink', 'surface-doc'],
  ['body', 'canvas'],
  ['body', 'surface-card'],
  ['body', 'surface-soft'],
  ['body', 'info-bg'],
  ['body', 'success-bg'],
  ['mute', 'canvas'],
  ['mute', 'surface-card'],
  ['mute', 'surface-soft'],
  ['mute', 'surface-doc'],
  ['mute', 'success-bg'],
  ['on-primary', 'primary'],
  ['on-primary', 'primary-pressed'],
  ['on-primary', 'primary-active'],
  ['canvas', 'ink'],
  ['link-teal', 'canvas'],
  ['link-teal', 'surface-card'],
  ['link-teal', 'surface-soft'],
  ['link-teal', 'warn-bg'],
  ['link-teal', 'error-bg'],
  ['link-teal', 'info-bg'],
  ['link-teal', 'success-bg'],
  ['link-blue', 'canvas'],
  ['link-blue', 'surface-card'],
  ['success-ink', 'success-bg'],
  ['success-ink', 'surface-card'],
  ['success-ink', 'canvas'],
  ['pending-ink', 'pending-bg'],
  ['danger-ink', 'danger-bg'],
  ['danger-ink', 'surface-card'],
  ['danger-ink', 'canvas'],
  ['danger-ink', 'surface-soft'],
  ['warn', 'warn-bg'],
  ['error', 'error-bg'],
  ['error', 'surface-soft'],
  ['error', 'surface-card'],
  ['error', 'canvas'],
  ['accent-green', 'accent-green-soft'],
  ['accent-red', 'accent-red-soft'],
  ['accent-purple', 'accent-purple-soft'],
  ['role-escrow-ink', 'role-escrow-soft'],
  ['role-mmf-ink', 'role-mmf-soft'],
  ['role-token-ink', 'role-token-soft'],
  ['role-operator-ink', 'role-operator-soft'],
  ['role-treasury-ink', 'role-treasury-soft'],
  ['role-entity-ink', 'role-entity-soft'],
  ['role-external-ink', 'role-external-soft'],
  ['on-dark', 'surface-dark'],
]

const FOCUS_PAIRS: [string, string][] = [
  ['focus-ring', 'canvas'],
  ['focus-ring', 'surface-card'],
  ['focus-ring', 'surface-soft'],
]

describe('receipt contrast', () => {
  const css = readFileSync(resolvePath(process.cwd(), 'src/index.css'), 'utf8')
  const light = props(slice(css, '/* f6z-light */', '/* /f6z-light */'))
  const darkOnly = props(slice(css, '/* f6z-dark */', '/* /f6z-dark */'))
  const forced = props(slice(css, '/* f6z-dark-forced */', '/* /f6z-dark-forced */'))
  const dark = new Map([...light, ...darkOnly])

  it('keeps the forced-dark block equal to the prefers-color-scheme block', () => {
    expect([...forced.entries()].sort()).toEqual([...darkOnly.entries()].sort())
  })

  it('still lets an untouched user follow prefers-color-scheme', () => {
    expect(css).toContain('@media (prefers-color-scheme: dark)')
    expect(css).toContain(':root:not([data-theme="light"])')
  })

  it('meets WCAG AA for text pairs in both themes', () => {
    const failures: string[] = []
    for (const [theme, map] of [
      ['light', light],
      ['dark', dark],
    ] as const) {
      for (const [foreground, background] of TEXT_PAIRS) {
        const ratio = contrast(resolve(map, foreground), resolve(map, background))
        if (ratio < 4.5) {
          failures.push(
            `${theme} --${foreground} on --${background} = ${ratio.toFixed(2)} (${resolve(map, foreground)} on ${resolve(map, background)})`,
          )
        }
      }
      for (const [foreground, background] of FOCUS_PAIRS) {
        const ratio = contrast(resolve(map, foreground), resolve(map, background))
        if (ratio < 3) {
          failures.push(
            `${theme} focus --${foreground} on --${background} = ${ratio.toFixed(2)}`,
          )
        }
      }
    }
    expect(failures).toEqual([])
  })
})
