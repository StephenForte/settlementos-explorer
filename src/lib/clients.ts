import { createPublicClient, http } from 'viem'
import { baseSepolia, polygonAmoy } from 'viem/chains'
import { NETWORKS, type NetworkId } from '../config/networks'

const VIEM_CHAINS = {
  'base-sepolia': baseSepolia,
  'polygon-amoy': polygonAmoy,
} as const

type AppPublicClient = ReturnType<typeof createClientFor>

const clients = new Map<NetworkId, AppPublicClient>()

function createClientFor(networkId: NetworkId) {
  return createPublicClient({
    chain: VIEM_CHAINS[networkId],
    transport: http(NETWORKS[networkId].rpcUrl, {
      timeout: 20_000,
      retryCount: 1,
    }),
  })
}

export function getPublicClient(networkId: NetworkId): AppPublicClient {
  const existing = clients.get(networkId)
  if (existing) return existing
  const client = createClientFor(networkId)
  clients.set(networkId, client)
  return client
}
