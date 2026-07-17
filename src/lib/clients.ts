import { createPublicClient, fallback, http } from 'viem'
import { baseSepolia, polygonAmoy } from 'viem/chains'
import { NETWORKS, type NetworkId } from '../config/networks'

const VIEM_CHAINS = {
  'base-sepolia': baseSepolia,
  'polygon-amoy': polygonAmoy,
} as const

/** Public RPCs only — primary first, then fallbacks when flaky. */
const RPC_URLS: Record<NetworkId, string[]> = {
  'base-sepolia': [
    NETWORKS['base-sepolia'].rpcUrl,
    'https://base-sepolia-rpc.publicnode.com',
    'https://base-sepolia.drpc.org',
  ],
  'polygon-amoy': [
    'https://polygon-amoy.drpc.org',
    'https://polygon-amoy-bor-rpc.publicnode.com',
    NETWORKS['polygon-amoy'].rpcUrl,
    'https://rpc-amoy.ankr.com',
  ],
}

type AppPublicClient = ReturnType<typeof createClientFor>

const clients = new Map<NetworkId, AppPublicClient>()

function createClientFor(networkId: NetworkId) {
  const urls = [...new Set(RPC_URLS[networkId])]
  return createPublicClient({
    chain: VIEM_CHAINS[networkId],
    transport: fallback(
      urls.map((url) =>
        http(url, {
          timeout: 12_000,
          retryCount: 0,
        }),
      ),
      { rank: false },
    ),
  })
}

export function getPublicClient(networkId: NetworkId): AppPublicClient {
  const existing = clients.get(networkId)
  if (existing) return existing
  const client = createClientFor(networkId)
  clients.set(networkId, client)
  return client
}
