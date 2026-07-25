import { getEnv } from '../lib/env'

export type NetworkId = 'base-sepolia' | 'fortel2-sepolia' | 'polygon-amoy'

export interface NetworkConfig {
  id: NetworkId
  name: string
  chainId: number
  rpcUrl: string
  /** Optional read-preferring RPC (e.g. ForteL2 Render replica). */
  readRpcUrl?: string
  /** Absent when no public block explorer is published yet. */
  explorerName: string | null
  explorerUrl: string | null
  nativeSymbol: string
  /** Whether Etherscan V2 multi-chain API covers this chainId. */
  etherscanApi: boolean
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
    etherscanApi: true,
  },
  // ForteL2 OP Stack L2 (Sepolia L1) — operated outside this repo.
  // Defaults from ForteL2 deployments/rail-interface.json. No block explorer yet.
  'fortel2-sepolia': {
    id: 'fortel2-sepolia',
    name: 'ForteL2 Sepolia',
    chainId: 852,
    rpcUrl:
      getEnv('VITE_FORTEL2_SEPOLIA_RPC_URL', 'FORTEL2_SEPOLIA_RPC_URL') ??
      'http://127.0.0.1:9545',
    readRpcUrl: getEnv(
      'VITE_FORTEL2_SEPOLIA_READ_RPC_URL',
      'FORTEL2_SEPOLIA_READ_RPC_URL',
    ),
    explorerName: null,
    explorerUrl: null,
    nativeSymbol: 'ETH',
    etherscanApi: false,
  },
  'polygon-amoy': {
    id: 'polygon-amoy',
    name: 'Polygon Amoy',
    chainId: 80002,
    rpcUrl: 'https://rpc-amoy.polygon.technology',
    explorerName: 'Polygonscan',
    explorerUrl: 'https://amoy.polygonscan.com',
    nativeSymbol: 'POL',
    etherscanApi: true,
  },
}

export const NETWORK_IDS = Object.keys(NETWORKS) as NetworkId[]

export function isNetworkId(value: string): value is NetworkId {
  return value in NETWORKS
}

export function explorerAddressUrl(
  networkId: NetworkId,
  address: string,
): string | null {
  const base = NETWORKS[networkId].explorerUrl
  return base ? `${base}/address/${address}` : null
}

export function explorerTxUrl(
  networkId: NetworkId,
  txHash: string,
): string | null {
  const base = NETWORKS[networkId].explorerUrl
  return base ? `${base}/tx/${txHash}` : null
}

export function explorerTokenUrl(
  networkId: NetworkId,
  tokenAddress: string,
): string | null {
  const base = NETWORKS[networkId].explorerUrl
  return base ? `${base}/token/${tokenAddress}` : null
}
