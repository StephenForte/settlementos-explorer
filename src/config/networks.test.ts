import { describe, expect, it } from 'vitest'
import {
  explorerAddressUrl,
  explorerTokenUrl,
  explorerTxUrl,
  isNetworkId,
  NETWORKS,
} from './networks'

describe('networks', () => {
  it('registers Base Sepolia and Polygon Amoy', () => {
    expect(NETWORKS['base-sepolia'].chainId).toBe(84532)
    expect(NETWORKS['polygon-amoy'].chainId).toBe(80002)
    expect(NETWORKS['polygon-amoy'].nativeSymbol).toBe('POL')
  })

  it('validates network ids', () => {
    expect(isNetworkId('base-sepolia')).toBe(true)
    expect(isNetworkId('mainnet')).toBe(false)
  })

  it('builds explorer deep links', () => {
    const addr = '0x5128889F20Ec13e0Be38b2BeBC568594159B652d'
    const tx = '0xabc'
    const token = '0x2066738d535681d28d0841cc2503c1c531d4d6aa'
    expect(explorerAddressUrl('polygon-amoy', addr)).toBe(
      `https://amoy.polygonscan.com/address/${addr}`,
    )
    expect(explorerTxUrl('base-sepolia', tx)).toBe(
      `https://sepolia.basescan.org/tx/${tx}`,
    )
    expect(explorerTokenUrl('base-sepolia', token)).toContain(`/token/${token}`)
  })
})
