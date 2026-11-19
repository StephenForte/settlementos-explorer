import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageSplit } from './PageSplit'

describe('PageSplit', () => {
  it('renders a main column and a side column', () => {
    render(<PageSplit main={<p>Receipt</p>} side={<p>Details</p>} />)
    expect(screen.getByText('Receipt').parentElement).toHaveClass('page-split-main')
    expect(screen.getByText('Details').parentElement).toHaveClass('page-split-side')
    expect(document.querySelector('.page-split')).not.toBeNull()
  })

  it('stacks to one column at 900px in the shared stylesheet', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    expect(css).toContain(
      'grid-template-columns: minmax(0, var(--page-main)) minmax(0, var(--page-side))',
    )
    expect(css).toContain('--page-stack: 900px')
    expect(css).toMatch(
      /@media \(max-width: 900px\) \{[\s\S]*\.page-split \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/,
    )
  })
})
