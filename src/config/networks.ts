export type NetworkId = 'base-sepolia' | 'polygon-amoy'

export interface NetworkConfig {
  id: NetworkId
  name: string
  chainId: number
  rpcUrl: string
  explorerName: string
  explorerUrl: string
  nativeSymbol: string
}

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  'base-sepolia': {
    id: 'base-sepolia',
    name: 'Base Sepolia',
    chainId: 84532,
    rpcUrl: 'https://sepolia.base.org',
    explorerName: 'Basescan',
    explorerUrl: 'https://sepolia.basescan.org',
    nativeSymbol: 'ETH',
  },
  'polygon-amoy': {
    id: 'polygon-amoy',
    name: 'Polygon Amoy',
    chainId: 80002,
    rpcUrl: 'https://rpc-amoy.polygon.technology',
    explorerName: 'Polygonscan',
    explorerUrl: 'https://amoy.polygonscan.com',
    nativeSymbol: 'POL',
  },
}

export const NETWORK_IDS = Object.keys(NETWORKS) as NetworkId[]

export function isNetworkId(value: string): value is NetworkId {
  return value in NETWORKS
}

export function explorerAddressUrl(networkId: NetworkId, address: string): string {
  return `${NETWORKS[networkId].explorerUrl}/address/${address}`
}

export function explorerTxUrl(networkId: NetworkId, txHash: string): string {
  return `${NETWORKS[networkId].explorerUrl}/tx/${txHash}`
}

export function explorerTokenUrl(networkId: NetworkId, tokenAddress: string): string {
  return `${NETWORKS[networkId].explorerUrl}/token/${tokenAddress}`
}
