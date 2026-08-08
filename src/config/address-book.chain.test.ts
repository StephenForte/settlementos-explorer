/// <reference types="node" />
import http, { type ServerResponse } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { getAddressesForNetwork, type AddressRole } from './address-book'
import { getEnv } from '../lib/env'

/**
 * Opt-in chain-852 liveness check (D11).
 *
 * Reads ForteL2 rows from ADDRESS_BOOK (via getAddressesForNetwork) and
 * asserts bytecode presence/absence on the live sequencer. Skips when the
 * RPC is unreachable so CI stays green without a route to 127.0.0.1:9545.
 *
 * A reachable-but-broken endpoint (HTTP error, JSON-RPC error, bad result)
 * fails the suite instead of skipping (D13 — pending operator record).
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

type RpcProbeOutcome =
  | { kind: 'reachable' }
  | { kind: 'unreachable' }
  | { kind: 'broken'; message: string }

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

async function probeRpcUrl(
  url: string,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<RpcProbeOutcome> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
          id: 1,
        }),
        signal: controller.signal,
      })
    } catch {
      // No HTTP response: connection refused, DNS failure, timeout, etc.
      return { kind: 'unreachable' }
    }

    if (!res.ok) {
      return {
        kind: 'broken',
        message: `RPC probe got HTTP ${res.status} from ${url}`,
      }
    }

    let body: unknown
    try {
      body = await res.json()
    } catch {
      return {
        kind: 'broken',
        message: `RPC probe got HTTP 200 but invalid JSON from ${url}`,
      }
    }

    const rpc = body as { error?: { message?: string }; result?: unknown }
    if (rpc.error) {
      const detail = rpc.error.message ?? 'unknown error'
      return {
        kind: 'broken',
        message: `RPC probe got JSON-RPC error from ${url}: ${detail}`,
      }
    }

    if (typeof rpc.result !== 'string' || rpc.result.length === 0) {
      return {
        kind: 'broken',
        message: `RPC probe eth_chainId from ${url}: missing or non-string result`,
      }
    }

    return { kind: 'reachable' }
  } finally {
    clearTimeout(timer)
  }
}

/** Empty contract code is the literal "0x", not "" or null. */
function isEmptyBytecode(code: string): boolean {
  return code === '0x'
}

const probeOutcome = await probeRpcUrl(RPC_URL)

if (probeOutcome.kind === 'broken') {
  describe(`ForteL2 chain-852 liveness (${RPC_URL})`, () => {
    it('RPC probe failed before chain assertions', () => {
      expect.fail(probeOutcome.message)
    })
  })
} else {
  describe.skipIf(probeOutcome.kind === 'unreachable')(
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
}

const stubServers: http.Server[] = []

afterEach(async () => {
  while (stubServers.length) {
    const server = stubServers.pop()
    if (!server) continue
    await new Promise<void>((resolve, reject) => {
      server.close((err: Error | undefined) => (err ? reject(err) : resolve()))
    })
  }
})

async function startRpcStub(respond: (res: ServerResponse) => void): Promise<string> {
  const server = http.createServer((_req, res) => {
    respond(res)
  })
  stubServers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Expected TCP address from stub RPC server')
  }
  return `http://127.0.0.1:${address.port}`
}

describe('ForteL2 RPC probe strictness', () => {
  it('treats HTTP 200 with a JSON-RPC error object as broken', async () => {
    const url = await startRpcStub((res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32603, message: 'internal error' },
        }),
      )
    })

    const outcome = await probeRpcUrl(url)
    expect(outcome.kind).toBe('broken')
    if (outcome.kind === 'broken') {
      expect(outcome.message).toContain(url)
    }
  })

  it('treats HTTP 500 as broken', async () => {
    const url = await startRpcStub((res) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('internal server error')
    })

    const outcome = await probeRpcUrl(url)
    expect(outcome.kind).toBe('broken')
    if (outcome.kind === 'broken') {
      expect(outcome.message).toContain(url)
    }
  })

  it('treats HTTP 200 with a missing or non-string result as broken', async () => {
    const url = await startRpcStub((res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: null }))
    })

    const outcome = await probeRpcUrl(url)
    expect(outcome.kind).toBe('broken')
    if (outcome.kind === 'broken') {
      expect(outcome.message).toContain(url)
    }
  })

  it('treats a closed port as unreachable', async () => {
    const outcome = await probeRpcUrl('http://127.0.0.1:1')
    expect(outcome.kind).toBe('unreachable')
  })
})
