import { describe, expect, it } from 'vitest'
import {
  explorerAddressUrl,
  explorerTokenUrl,
  explorerTxUrl,
  isNetworkId,
  NETWORK_IDS,
  NETWORKS,
} from './networks'

describe('networks', () => {
  it('registers Base Sepolia, ForteL2 Sepolia, and Polygon Amoy', () => {
    expect(NETWORK_IDS).toEqual([
      'base-sepolia',
      'fortel2-sepolia',
      'polygon-amoy',
    ])
    expect(NETWORKS['base-sepolia'].chainId).toBe(84532)
    expect(NETWORKS['fortel2-sepolia'].chainId).toBe(852)
    expect(NETWORKS['polygon-amoy'].chainId).toBe(80002)
    expect(NETWORKS['polygon-amoy'].nativeSymbol).toBe('POL')
    expect(NETWORKS['fortel2-sepolia'].nativeSymbol).toBe('ETH')
    expect(NETWORKS['fortel2-sepolia'].etherscanApi).toBe(false)
    expect(NETWORKS['fortel2-sepolia'].explorerUrl).toBeNull()
  })

  it('validates network ids', () => {
    expect(isNetworkId('base-sepolia')).toBe(true)
    expect(isNetworkId('fortel2-sepolia')).toBe(true)
    expect(isNetworkId('mainnet')).toBe(false)
  })

  it('builds explorer deep links when an explorer exists', () => {
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

  it('returns null explorer links for ForteL2', () => {
    expect(
      explorerAddressUrl(
        'fortel2-sepolia',
        '0x5128889F20Ec13e0Be38b2BeBC568594159B652d',
      ),
    ).toBeNull()
    expect(explorerTxUrl('fortel2-sepolia', '0xabc')).toBeNull()
    expect(
      explorerTokenUrl(
        'fortel2-sepolia',
        '0x2066738d535681d28d0841cc2503c1c531d4d6aa',
      ),
    ).toBeNull()
  })
})
