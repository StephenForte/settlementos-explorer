import { describe, expect, it } from 'vitest'
import { getAddressesForNetwork, type AddressRole } from './address-book'
import { getEnv } from '../lib/env'

/**
 * Opt-in chain-852 liveness check (D11).
 *
 * Reads ForteL2 rows from ADDRESS_BOOK (via getAddressesForNetwork) and
 * asserts bytecode presence/absence on the live sequencer. Skips when the
 * RPC is unreachable so CI stays green without a route to 127.0.0.1:9545.
 */

const CONTRACT_ROLES = new Set<AddressRole>([
  'escrow-contract',
  'mmf-contract',
  'token-contract',
])

const EOA_ROLES = new Set<AddressRole>(['operator', 'treasury', 'entity'])

const RPC_URL =
  getEnv('VITE_FORTEL2_SEPOLIA_RPC_URL', 'FORTEL2_SEPOLIA_RPC_URL') ??
  'http://127.0.0.1:9545'

const PROBE_TIMEOUT_MS = 1_500

type JsonRpcSuccess = { jsonrpc: string; id: number; result: string }

async function jsonRpc(
  method: string,
  params: unknown[],
  timeoutMs = 5_000,
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`RPC HTTP ${res.status} for ${method}`)
    }
    const body = (await res.json()) as JsonRpcSuccess & { error?: { message: string } }
    if (body.error) {
      throw new Error(`RPC error for ${method}: ${body.error.message}`)
    }
    if (typeof body.result !== 'string') {
      throw new Error(`RPC ${method}: missing string result`)
    }
    return body.result
  } finally {
    clearTimeout(timer)
  }
}

async function probeRpcReachable(): Promise<boolean> {
  try {
    const result = await jsonRpc('eth_chainId', [], PROBE_TIMEOUT_MS)
    return typeof result === 'string' && result.length > 0
  } catch {
    return false
  }
}

/** Empty contract code is the literal "0x", not "" or null. */
function isEmptyBytecode(code: string): boolean {
  return code === '0x'
}

const rpcReachable = await probeRpcReachable()

describe.skipIf(!rpcReachable)(
  `ForteL2 chain-852 liveness (${RPC_URL})`,
  () => {
    it('asserts chain 852 and ADDRESS_BOOK bytecode shape for all 11 rows', async () => {
      const chainIdHex = await jsonRpc('eth_chainId', [])
      const chainId = Number.parseInt(chainIdHex, 16)
      expect(chainId, `eth_chainId was ${chainIdHex}`).toBe(852)

      const rows = getAddressesForNetwork('fortel2-sepolia')
      expect(rows).toHaveLength(11)

      for (const entry of rows) {
        const code = await jsonRpc('eth_getCode', [entry.address, 'latest'])
        const tag = `${entry.label} (${entry.role}) ${entry.address}`

        if (CONTRACT_ROLES.has(entry.role)) {
          expect(isEmptyBytecode(code), `${tag}: expected contract bytecode`).toBe(
            false,
          )
          expect(code.startsWith('0x'), `${tag}: eth_getCode must be hex`).toBe(
            true,
          )
          expect(code.length, `${tag}: bytecode hex too short`).toBeGreaterThan(2)
        } else if (EOA_ROLES.has(entry.role)) {
          // Truthiness would treat "0x" as present and invert this assertion.
          expect(code, `${tag}: expected EOA (empty code "0x")`).toBe('0x')
        } else {
          expect.fail(`${tag}: unexpected role for liveness check`)
        }
      }
    })
  },
)
