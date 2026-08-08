import { createPublicClient, defineChain, fallback, http } from 'viem'
import { baseSepolia, polygonAmoy } from 'viem/chains'
import { NETWORKS, type NetworkId } from '../config/networks'
import { cacheClear } from './cache'
import {
  clearRpcOverride,
  getRpcOverride,
  setRpcOverride,
  type RpcUrlValidation,
} from './rpc-overrides'

const forteL2Sepolia = defineChain({
  id: NETWORKS['fortel2-sepolia'].chainId,
  name: NETWORKS['fortel2-sepolia'].name,
  nativeCurrency: {
    name: 'Ether',
    symbol: NETWORKS['fortel2-sepolia'].nativeSymbol,
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [NETWORKS['fortel2-sepolia'].rpcUrl] },
  },
})

const VIEM_CHAINS = {
  'base-sepolia': baseSepolia,
  'fortel2-sepolia': forteL2Sepolia,
  'polygon-amoy': polygonAmoy,
} as const

/**
 * Built-in public RPCs only — primary first, then fallbacks when flaky.
 * User overrides layer above this in `resolveRpcUrls`; NETWORKS stays untouched
 * so the chain liveness suite keeps verifying what ships (D16 / PLAN §3b).
 */
const BUILTIN_RPC_URLS: Record<NetworkId, string[]> = {
  'base-sepolia': [
    NETWORKS['base-sepolia'].rpcUrl,
    'https://base-sepolia-rpc.publicnode.com',
    'https://base-sepolia.drpc.org',
  ],
  'fortel2-sepolia': [
    // Prefer replica for reads when configured; sequencer last.
    ...(NETWORKS['fortel2-sepolia'].readRpcUrl
      ? [NETWORKS['fortel2-sepolia'].readRpcUrl]
      : []),
    NETWORKS['fortel2-sepolia'].rpcUrl,
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

/**
 * Resolve the URL list a client for `networkId` will use.
 * Precedence: user override → env-backed NETWORKS / built-in fallback list.
 * When a user override is set it is the sole endpoint (their network position
 * may not reach the public fallbacks).
 */
export function resolveRpcUrls(networkId: NetworkId): string[] {
  const override = getRpcOverride(networkId)
  if (override) return [override]
  return [...new Set(BUILTIN_RPC_URLS[networkId].filter(Boolean))]
}

function createClientFor(networkId: NetworkId) {
  const urls = resolveRpcUrls(networkId)
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

/**
 * Drop the cached client for a network (or all) and clear the shared data
 * cache so balances *and* transfers re-hit RPC on the next call.
 */
export function invalidatePublicClient(networkId?: NetworkId): void {
  if (networkId) clients.delete(networkId)
  else clients.clear()
  cacheClear()
}

/** Validate, persist, and invalidate so the next RPC call uses the new host. */
export function setNetworkRpcOverride(
  networkId: NetworkId,
  url: string,
): RpcUrlValidation {
  const result = setRpcOverride(networkId, url)
  if (result.ok) invalidatePublicClient(networkId)
  return result
}

/** Clear the override and restore the built-in / env default path. */
export function clearNetworkRpcOverride(networkId: NetworkId): void {
  clearRpcOverride(networkId)
  invalidatePublicClient(networkId)
}
