import type { Address } from 'viem'
import { erc20Abi } from '../config/abis'
import { getTokens, type TokenMeta } from '../config/address-book'
import { NETWORKS, type NetworkId } from '../config/networks'
import { cached } from '../lib/cache'
import { getPublicClient } from '../lib/clients'
import { formatNative, formatTokenAmount } from '../lib/format'

export type BalanceStatus = 'ok' | 'unavailable'

export interface TokenBalance {
  token: TokenMeta
  raw: bigint | null
  formatted: string | null
  status: BalanceStatus
  error?: string
}

export interface NativeBalance {
  symbol: string
  raw: bigint | null
  formatted: string | null
  status: BalanceStatus
  error?: string
}

export interface AddressBalances {
  networkId: NetworkId
  address: string
  native: NativeBalance
  tokens: TokenBalance[]
}

function unavailableNative(symbol: string, error: string): NativeBalance {
  return { symbol, raw: null, formatted: null, status: 'unavailable', error }
}

function unavailableToken(token: TokenMeta, error: string): TokenBalance {
  return { token, raw: null, formatted: null, status: 'unavailable', error }
}

async function fetchBalances(
  networkId: NetworkId,
  address: string,
): Promise<AddressBalances> {
  const client = getPublicClient(networkId)
  const tokens = getTokens(networkId)
  const symbol = NETWORKS[networkId].nativeSymbol
  const addr = address as Address

  const nativePromise = client
    .getBalance({ address: addr })
    .then(
      (raw): NativeBalance => ({
        symbol,
        raw,
        formatted: formatNative(raw),
        status: 'ok',
      }),
      (err: unknown): NativeBalance =>
        unavailableNative(symbol, err instanceof Error ? err.message : 'RPC error'),
    )

  const tokenPromises = tokens.map((token) =>
    client
      .readContract({
        address: token.address as Address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [addr],
      })
      .then(
        (raw): TokenBalance => ({
          token,
          raw,
          formatted: formatTokenAmount(raw, token.decimals),
          status: 'ok',
        }),
        (err: unknown): TokenBalance =>
          unavailableToken(
            token,
            err instanceof Error ? err.message : 'RPC error',
          ),
      ),
  )

  const [native, ...tokenBalances] = await Promise.all([
    nativePromise,
    ...tokenPromises,
  ])

  return {
    networkId,
    address,
    native,
    tokens: tokenBalances,
  }
}

export function getBalances(
  networkId: NetworkId,
  address: string,
): Promise<AddressBalances> {
  const key = `balances:${networkId}:${address.toLowerCase()}`
  return cached(key, () => fetchBalances(networkId, address))
}
