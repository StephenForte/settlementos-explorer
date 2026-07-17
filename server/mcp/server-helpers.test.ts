import { describe, expect, it } from 'vitest'
import { filterAddressBook, summarizeExplorer } from './server.ts'

describe('filterAddressBook', () => {
  it('filters by network, role, and label', () => {
    const base = filterAddressBook({ networkId: 'base-sepolia' })
    expect(base.length).toBeGreaterThan(0)
    expect(base.every((a) => a.networkId === 'base-sepolia')).toBe(true)

    const tokens = filterAddressBook({
      networkId: 'base-sepolia',
      role: 'token-contract',
    })
    expect(tokens.every((a) => a.role === 'token-contract')).toBe(true)

    const acme = filterAddressBook({ labelContains: 'acme' })
    expect(acme.some((a) => a.entityId === 'ent_acme_us')).toBe(true)
  })
})

describe('summarizeExplorer', () => {
  it('returns network and role aggregates', () => {
    const summary = summarizeExplorer()
    expect(summary.totalAddresses).toBeGreaterThan(0)
    expect(summary.networks).toHaveLength(2)
    expect(summary.entities.length).toBeGreaterThan(0)
    expect(summary.byRole['entity']).toBeGreaterThan(0)
  })
})
