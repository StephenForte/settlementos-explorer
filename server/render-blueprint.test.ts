/**
 * @vitest-environment node
 *
 * Locks the Render pin from D39. Local and CI stay on Node 22; this file
 * only guards the Blueprint the service actually builds with.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const blueprint = readFileSync(join(root, 'render.yaml'), 'utf8')

/** Minimum Node patch for the 2026-10-21 security release on the 26.x line. */
const MIN_NODE = [26, 12, 1] as const

function blueprintNodeVersion(yaml: string): number[] {
  const match = yaml.match(
    /^\s*-\s*key:\s*NODE_VERSION\s*\n\s*value:\s*"(\d+)\.(\d+)\.(\d+)"/m,
  )
  if (!match) {
    throw new Error('render.yaml NODE_VERSION must be a full x.y.z pin')
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function atLeast(actual: number[], minimum: readonly number[]): boolean {
  for (let i = 0; i < minimum.length; i++) {
    const left = actual[i] ?? 0
    const right = minimum[i] ?? 0
    if (left > right) return true
    if (left < right) return false
  }
  return true
}

describe('Render blueprint runtime', () => {
  it('pins Node to 26.12.1 or newer', () => {
    expect(atLeast(blueprintNodeVersion(blueprint), MIN_NODE)).toBe(true)
  })

  it('is a Node service, so the PHP and Python security releases do not apply', () => {
    expect(blueprint).toMatch(/^    runtime: node$/m)
    expect(blueprint).not.toMatch(/PHP_VERSION|PYTHON_VERSION/)
    expect(blueprint).not.toMatch(/runtime:\s*(php|python|docker)/)
    for (const absent of [
      'composer.json',
      'composer.lock',
      'requirements.txt',
      'pyproject.toml',
      'Pipfile',
      'Dockerfile',
    ]) {
      expect(existsSync(join(root, absent)), absent).toBe(false)
    }
  })
})
