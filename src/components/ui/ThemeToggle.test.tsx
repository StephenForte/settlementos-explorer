import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ThemeToggle } from './ThemeToggle'
import { THEME_STORAGE_KEY } from './theme'

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
  localStorage.clear()
})

describe('ThemeToggle', () => {
  it('defaults to system and leaves prefers-color-scheme in charge', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('persists light and dark, and system clears the override', () => {
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    fireEvent.click(screen.getByRole('button', { name: 'Light' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')

    fireEvent.click(screen.getByRole('button', { name: 'System' }))
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
  })

  it('reads a stored choice before the first paint path the shell uses', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('still applies the choice when storage throws', () => {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('blocked')
    }
    try {
      render(<ThemeToggle />)
      expect(() => fireEvent.click(screen.getByRole('button', { name: 'Light' }))).not.toThrow()
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    } finally {
      Storage.prototype.setItem = setItem
    }
  })

  it('blocks the wrong theme before CSS by setting data-theme from the same key', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
    const inline = html.slice(html.indexOf('<head>'), html.indexOf('<meta charset'))
    expect(inline).toContain(THEME_STORAGE_KEY)
    expect(inline).toContain("document.documentElement.setAttribute('data-theme', stored)")
    expect(inline).toContain('try')
    expect(inline).toContain('catch')
    expect(inline).not.toContain('type="module"')
    expect(html.indexOf(THEME_STORAGE_KEY)).toBeLessThan(html.indexOf('src="/src/main.tsx"'))
  })
})
