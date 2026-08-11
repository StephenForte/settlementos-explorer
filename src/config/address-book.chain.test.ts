/// <reference types="node" />
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { LOG_CHUNK } from '../chain/transfers'
import { getEnv } from '../lib/env'
import { getAddressesForNetwork, type AddressRole } from './address-book'
import { NETWORKS, type NetworkId } from './networks'

/**
 * Chain liveness checks against live RPCs (D11 / D13 / D14).
 *
 * ForteL2 (private sequencer): skip only on transport failure; a reachable-
 * but-broken endpoint fails (D13).
 *
 * Base Sepolia / Polygon Amoy (public RPCs): also skip when the provider
 * refuses or throttles — HTTP 403/408/429/502/503/504, or JSON-RPC rate-limit
 * errors — so CI does not go red for reasons unrelated to the address book
 * (D14 judgement). Wrong chain id and wrong bytecode shape still fail.
 *
 * Describe titles name the network so a skip is attributable (trap 9).
 */

const CONTRACT_ROLES = new Set<AddressRole>([
  'escrow-contract',
  'mmf-contract',
  'token-contract',
])

const EOA_ROLES = new Set<AddressRole>(['operator', 'treasury', 'entity'])

/** Provider refusal / throttle — skip only when availabilityAware (public RPCs). */
const AVAILABILITY_HTTP_STATUSES = new Set([403, 408, 429, 502, 503, 504])

/** Common public-RPC rate-limit JSON-RPC code (Infura / similar). */
const RATE_LIMIT_RPC_CODE = -32005

const FORTEL2_RPC_URL =
  getEnv('VITE_FORTEL2_SEPOLIA_RPC_URL', 'FORTEL2_SEPOLIA_RPC_URL') ??
  'http://127.0.0.1:9545'

const PROBE_TIMEOUT_MS = 1_500
/** Public eth_getCode can be slow; stay well above the 1.5s probe. */
const PUBLIC_RPC_TIMEOUT_MS = 15_000
/** Public networks share a 10-row address book (must match live block expectations). */
const PUBLIC_ROWS_PER_NETWORK = 10
/**
 * Suite budget must cover eth_chainId + one eth_getCode per row + eth_blockNumber +
 * eth_getLogs (capability) at the per-request timeout, plus a small margin.
 */
const PUBLIC_SUITE_TIMEOUT_MARGIN_MS = 15_000
/** chainId + getCode×rows + blockNumber + getLogs */
const PUBLIC_LIVENESS_RPC_CALLS = PUBLIC_ROWS_PER_NETWORK + 3
const PUBLIC_SUITE_TIMEOUT_MS =
  PUBLIC_RPC_TIMEOUT_MS * PUBLIC_LIVENESS_RPC_CALLS +
  PUBLIC_SUITE_TIMEOUT_MARGIN_MS

/** ERC-20 Transfer — same event the app's getLogsChunked requests. */
const TRANSFER_EVENT_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

type JsonRpcSuccess = { jsonrpc: string; id: number; result: string }

/**
 * Provider refusal/throttle after the probe (D14). Thrown only from availability-
 * aware `jsonRpc` calls; public live blocks catch this and `skip()`, nothing else.
 */
class RpcUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RpcUnavailableError'
  }
}

type RpcProbeOutcome =
  | { kind: 'reachable' }
  | { kind: 'unreachable' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'broken'; message: string }

type ProbeOptions = {
  /**
   * When true (public RPCs), provider refusal/throttle → `unavailable` (skip).
   * When false (ForteL2), those responses stay `broken` (fail) — D13 unchanged.
   */
  availabilityAware?: boolean
  timeoutMs?: number
}

/**
 * Single source for each network's probe availability posture (D13 / D14).
 * Live blocks and posture guards must both read from here — never re-declare
 * `availabilityAware` at a call site the guards are meant to protect.
 */
const PROBE_OPTIONS = {
  'fortel2-sepolia': {}, // D13: private sequencer — no availability class
  'base-sepolia': { availabilityAware: true }, // D14
  'polygon-amoy': { availabilityAware: true }, // D14
} as const satisfies Record<NetworkId, ProbeOptions>

type LivenessGate = 'run' | 'skip' | 'fail'

function publicRpcUrl(networkId: 'base-sepolia' | 'polygon-amoy'): string {
  if (networkId === 'base-sepolia') {
    return (
      getEnv('VITE_BASE_SEPOLIA_RPC_URL', 'BASE_SEPOLIA_RPC_URL') ??
      NETWORKS['base-sepolia'].rpcUrl
    )
  }
  return (
    getEnv('VITE_POLYGON_AMOY_RPC_URL', 'POLYGON_AMOY_RPC_URL') ??
    NETWORKS['polygon-amoy'].rpcUrl
  )
}

function isRateLimitRpcError(error: {
  code?: unknown
  message?: unknown
}): boolean {
  if (error.code === RATE_LIMIT_RPC_CODE) return true
  if (typeof error.message !== 'string') return false
  return /rate.?limit|too many requests|exceeded.*limit|limit exceeded/i.test(
    error.message,
  )
}

async function jsonRpcFetch(
  rpcUrl: string,
  method: string,
  params: unknown[],
  timeoutMs = 5_000,
  availabilityAware = false,
  /**
   * When true (eth_getLogs capability path), JSON-RPC errors always fail —
   * including `-32005` / "limit exceeded". Range-limit rejections often reuse
   * those codes (D15/thirdweb); routing them to skip would hide the missing
   * capability. HTTP throttle statuses still skip when availabilityAware.
   */
  jsonRpcErrorsAlwaysFail = false,
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
      signal: controller.signal,
    })
    if (!res.ok) {
      if (availabilityAware && AVAILABILITY_HTTP_STATUSES.has(res.status)) {
        throw new RpcUnavailableError(
          `RPC HTTP ${res.status} for ${method} (provider unavailable)`,
        )
      }
      throw new Error(`RPC HTTP ${res.status} for ${method}`)
    }
    const body = (await res.json()) as JsonRpcSuccess & {
      error?: { code?: unknown; message?: string }
      result?: unknown
    }
    if (body.error) {
      if (
        !jsonRpcErrorsAlwaysFail &&
        availabilityAware &&
        isRateLimitRpcError(body.error)
      ) {
        const detail = body.error.message ?? `code ${String(body.error.code)}`
        throw new RpcUnavailableError(
          `RPC rate-limited for ${method}: ${detail}`,
        )
      }
      throw new Error(
        `RPC error for ${method}: ${body.error.message ?? 'unknown error'}`,
      )
    }
    return body.result
  } finally {
    clearTimeout(timer)
  }
}

async function jsonRpc(
  rpcUrl: string,
  method: string,
  params: unknown[],
  timeoutMs = 5_000,
  availabilityAware = false,
): Promise<string> {
  const result = await jsonRpcFetch(
    rpcUrl,
    method,
    params,
    timeoutMs,
    availabilityAware,
  )
  if (typeof result !== 'string') {
    throw new Error(`RPC ${method}: missing string result`)
  }
  return result
}

/**
 * eth_getLogs at the app's LOG_CHUNK span. Asserts the endpoint accepted the
 * request — empty arrays are healthy. Does not assert non-empty results.
 */
async function assertEthGetLogsCapability(opts: {
  rpcUrl: string
  tokenAddress: string
  timeoutMs?: number
  availabilityAware?: boolean
}): Promise<{ fromBlock: bigint; toBlock: bigint }> {
  const timeoutMs = opts.timeoutMs ?? 5_000
  const availabilityAware = opts.availabilityAware === true
  const latestHex = await jsonRpc(
    opts.rpcUrl,
    'eth_blockNumber',
    [],
    timeoutMs,
    availabilityAware,
  )
  const latest = BigInt(latestHex)
  const toBlock = latest
  const fromBlock =
    latest + 1n >= LOG_CHUNK ? latest - (LOG_CHUNK - 1n) : 0n

  const result = await jsonRpcFetch(
    opts.rpcUrl,
    'eth_getLogs',
    [
      {
        address: opts.tokenAddress,
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: `0x${toBlock.toString(16)}`,
        topics: [TRANSFER_EVENT_TOPIC],
      },
    ],
    timeoutMs,
    availabilityAware,
    true, // range-limit JSON-RPC errors must fail, not skip (F6r / Trap 2)
  )

  if (!Array.isArray(result)) {
    throw new Error(
      `RPC eth_getLogs: expected array result, got ${typeof result}`,
    )
  }
  return { fromBlock, toBlock }
}

async function probeRpcUrl(
  url: string,
  options: ProbeOptions = {},
): Promise<RpcProbeOutcome> {
  const timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS
  const availabilityAware = options.availabilityAware === true
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
      if (availabilityAware && AVAILABILITY_HTTP_STATUSES.has(res.status)) {
        return {
          kind: 'unavailable',
          message: `RPC probe got HTTP ${res.status} from ${url} (provider unavailable)`,
        }
      }
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

    const rpc = body as {
      error?: { code?: unknown; message?: string }
      result?: unknown
    }
    if (rpc.error) {
      if (availabilityAware && isRateLimitRpcError(rpc.error)) {
        const detail = rpc.error.message ?? `code ${String(rpc.error.code)}`
        return {
          kind: 'unavailable',
          message: `RPC probe got rate-limited JSON-RPC error from ${url}: ${detail}`,
        }
      }
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

/** Map a probe outcome to suite action. `unavailable` only arises under availabilityAware. */
function livenessGate(outcome: RpcProbeOutcome): LivenessGate {
  if (outcome.kind === 'unreachable' || outcome.kind === 'unavailable') {
    return 'skip'
  }
  if (outcome.kind === 'broken') return 'fail'
  return 'run'
}

/** Empty contract code is the literal "0x", not "" or null. */
function isEmptyBytecode(code: string): boolean {
  return code === '0x'
}

async function assertAddressBookLiveness(opts: {
  rpcUrl: string
  networkId: NetworkId
  expectedChainId: number
  expectedRowCount: number
  requestTimeoutMs?: number
  /** Public RPCs only — mid-run throttle/refusal → RpcUnavailableError (D14). */
  availabilityAware?: boolean
}): Promise<void> {
  const timeoutMs = opts.requestTimeoutMs ?? 5_000
  const availabilityAware = opts.availabilityAware === true
  const chainIdHex = await jsonRpc(
    opts.rpcUrl,
    'eth_chainId',
    [],
    timeoutMs,
    availabilityAware,
  )
  const chainId = Number.parseInt(chainIdHex, 16)
  expect(chainId, `eth_chainId was ${chainIdHex}`).toBe(opts.expectedChainId)

  const rows = getAddressesForNetwork(opts.networkId)
  expect(rows).toHaveLength(opts.expectedRowCount)

  // Sequential on purpose — parallel getCode against free public RPCs rate-limits.
  for (const entry of rows) {
    const code = await jsonRpc(
      opts.rpcUrl,
      'eth_getCode',
      [entry.address, 'latest'],
      timeoutMs,
      availabilityAware,
    )
    const tag = `${entry.label} (${entry.role}) ${entry.address}`

    if (CONTRACT_ROLES.has(entry.role)) {
      expect(isEmptyBytecode(code), `${tag}: expected contract bytecode`).toBe(
        false,
      )
      expect(code.startsWith('0x'), `${tag}: eth_getCode must be hex`).toBe(true)
      expect(code.length, `${tag}: bytecode hex too short`).toBeGreaterThan(2)
    } else if (EOA_ROLES.has(entry.role)) {
      // Truthiness would treat "0x" as present and invert this assertion.
      expect(code, `${tag}: expected EOA (empty code "0x")`).toBe('0x')
    } else {
      expect.fail(`${tag}: unexpected role for liveness check`)
    }
  }

  // eth_getLogs at LOG_CHUNK — capability the app relies on; empty [] is healthy.
  const tokenRow = rows.find((r) => r.role === 'token-contract')
  expect(tokenRow, 'address book must include a token-contract row').toBeDefined()
  await assertEthGetLogsCapability({
    rpcUrl: opts.rpcUrl,
    tokenAddress: tokenRow!.address,
    timeoutMs,
    availabilityAware,
  })
}

/**
 * Probe → gate → assertions. Used by live suites and by stub e2e tests so the
 * wiring (not just the classifier) is covered.
 */
async function evaluateLivenessBlock(opts: {
  rpcUrl: string
  networkId: NetworkId
  expectedChainId: number
  expectedRowCount: number
  probeTimeoutMs?: number
  requestTimeoutMs?: number
}): Promise<'passed' | 'skipped'> {
  const probeOptions = PROBE_OPTIONS[opts.networkId]
  const availabilityAware =
    'availabilityAware' in probeOptions &&
    probeOptions.availabilityAware === true
  const outcome = await probeRpcUrl(opts.rpcUrl, {
    ...probeOptions,
    timeoutMs: opts.probeTimeoutMs,
  })
  const gate = livenessGate(outcome)
  if (gate === 'skip') return 'skipped'
  if (gate === 'fail') {
    const message =
      outcome.kind === 'broken' || outcome.kind === 'unavailable'
        ? outcome.message
        : 'RPC probe failed'
    throw new Error(message)
  }
  try {
    await assertAddressBookLiveness({
      rpcUrl: opts.rpcUrl,
      networkId: opts.networkId,
      expectedChainId: opts.expectedChainId,
      expectedRowCount: opts.expectedRowCount,
      requestTimeoutMs: opts.requestTimeoutMs,
      availabilityAware,
    })
  } catch (err) {
    // Narrow catch — AssertionError / wrong-chain / plain Error must still fail.
    if (err instanceof RpcUnavailableError) return 'skipped'
    throw err
  }
  return 'passed'
}

// --- Live suites (probe at module load) ------------------------------------

const fortel2Probe = await probeRpcUrl(
  FORTEL2_RPC_URL,
  PROBE_OPTIONS['fortel2-sepolia'],
)

if (fortel2Probe.kind === 'broken') {
  describe(`ForteL2 chain-852 liveness (${FORTEL2_RPC_URL})`, () => {
    it('RPC probe failed before chain assertions', () => {
      expect.fail(fortel2Probe.message)
    })
  })
} else {
  describe.skipIf(fortel2Probe.kind === 'unreachable')(
    `ForteL2 chain-852 liveness (${FORTEL2_RPC_URL})`,
    () => {
      it('asserts chain 852 and ADDRESS_BOOK bytecode shape for all 11 rows', async () => {
        await assertAddressBookLiveness({
          rpcUrl: FORTEL2_RPC_URL,
          networkId: 'fortel2-sepolia',
          expectedChainId: 852,
          expectedRowCount: 11,
        })
      })
    },
  )
}

const BASE_SEPOLIA_RPC_URL = publicRpcUrl('base-sepolia')
const baseProbe = await probeRpcUrl(
  BASE_SEPOLIA_RPC_URL,
  PROBE_OPTIONS['base-sepolia'],
)

if (baseProbe.kind === 'broken') {
  describe(`Base Sepolia chain-84532 liveness (${BASE_SEPOLIA_RPC_URL})`, () => {
    it('RPC probe failed before chain assertions', () => {
      expect.fail(baseProbe.message)
    })
  })
} else {
  describe.skipIf(
    baseProbe.kind === 'unreachable' || baseProbe.kind === 'unavailable',
  )(`Base Sepolia chain-84532 liveness (${BASE_SEPOLIA_RPC_URL})`, () => {
    it(
      `asserts chain 84532 and ADDRESS_BOOK bytecode shape for all ${PUBLIC_ROWS_PER_NETWORK} rows`,
      async (ctx) => {
        try {
          await assertAddressBookLiveness({
            rpcUrl: BASE_SEPOLIA_RPC_URL,
            networkId: 'base-sepolia',
            expectedChainId: 84532,
            expectedRowCount: PUBLIC_ROWS_PER_NETWORK,
            requestTimeoutMs: PUBLIC_RPC_TIMEOUT_MS,
            // Public block — D14; ForteL2 never passes this flag.
            availabilityAware: true,
          })
        } catch (err) {
          if (err instanceof RpcUnavailableError) {
            return ctx.skip()
          }
          throw err
        }
      },
      PUBLIC_SUITE_TIMEOUT_MS,
    )
  })
}

const POLYGON_AMOY_RPC_URL = publicRpcUrl('polygon-amoy')
const amoyProbe = await probeRpcUrl(
  POLYGON_AMOY_RPC_URL,
  PROBE_OPTIONS['polygon-amoy'],
)

if (amoyProbe.kind === 'broken') {
  describe(`Polygon Amoy chain-80002 liveness (${POLYGON_AMOY_RPC_URL})`, () => {
    it('RPC probe failed before chain assertions', () => {
      expect.fail(amoyProbe.message)
    })
  })
} else {
  describe.skipIf(
    amoyProbe.kind === 'unreachable' || amoyProbe.kind === 'unavailable',
  )(`Polygon Amoy chain-80002 liveness (${POLYGON_AMOY_RPC_URL})`, () => {
    it(
      `asserts chain 80002 and ADDRESS_BOOK bytecode shape for all ${PUBLIC_ROWS_PER_NETWORK} rows`,
      async (ctx) => {
        try {
          await assertAddressBookLiveness({
            rpcUrl: POLYGON_AMOY_RPC_URL,
            networkId: 'polygon-amoy',
            expectedChainId: 80002,
            expectedRowCount: PUBLIC_ROWS_PER_NETWORK,
            requestTimeoutMs: PUBLIC_RPC_TIMEOUT_MS,
            // Public block — D14; ForteL2 never passes this flag.
            availabilityAware: true,
          })
        } catch (err) {
          if (err instanceof RpcUnavailableError) {
            return ctx.skip()
          }
          throw err
        }
      },
      PUBLIC_SUITE_TIMEOUT_MS,
    )
  })
}

// --- Stub servers ----------------------------------------------------------

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

async function startRpcStub(
  respond: (res: ServerResponse) => void,
): Promise<string> {
  const server = http.createServer((_req, res) => {
    respond(res)
  })
  stubServers.push(server)
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  )
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Expected TCP address from stub RPC server')
  }
  return `http://127.0.0.1:${address.port}`
}

async function readJsonBody(req: IncomingMessage): Promise<{
  method?: string
  params?: unknown[]
}> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  return JSON.parse(raw) as { method?: string; params?: unknown[] }
}

async function startJsonRpcStub(
  handler: (
    method: string,
    params: unknown[],
  ) => { status?: number; body: unknown },
): Promise<string> {
  const server = http.createServer((req, res) => {
    void (async () => {
      const body = await readJsonBody(req)
      const method = body.method ?? ''
      const params = body.params ?? []
      const { status = 200, body: responseBody } = handler(method, params)
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(responseBody))
    })()
  })
  stubServers.push(server)
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  )
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

    const outcome = await probeRpcUrl(url, PROBE_OPTIONS['fortel2-sepolia'])
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

    const outcome = await probeRpcUrl(url, PROBE_OPTIONS['fortel2-sepolia'])
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

    const outcome = await probeRpcUrl(url, PROBE_OPTIONS['fortel2-sepolia'])
    expect(outcome.kind).toBe('broken')
    if (outcome.kind === 'broken') {
      expect(outcome.message).toContain(url)
    }
  })

  it('treats a closed port as unreachable', async () => {
    const outcome = await probeRpcUrl(
      'http://127.0.0.1:1',
      PROBE_OPTIONS['fortel2-sepolia'],
    )
    expect(outcome.kind).toBe('unreachable')
  })
})

/**
 * Posture guards read PROBE_OPTIONS — the same map the live blocks use.
 * Mutating an entry must turn the matching guard red (F6k / D14 known gap).
 */
describe('probe options posture (D13 / D14)', () => {
  it('ForteL2 posture: HTTP 429 is broken/fail — no availability class (D13)', async () => {
    const url = await startRpcStub((res) => {
      res.writeHead(429, { 'Content-Type': 'text/plain' })
      res.end('slow down')
    })
    const outcome = await probeRpcUrl(url, PROBE_OPTIONS['fortel2-sepolia'])
    expect(outcome.kind).toBe('broken')
    expect(livenessGate(outcome)).toBe('fail')
  })

  it('Base Sepolia posture: HTTP 429 is unavailable/skip (D14)', async () => {
    const url = await startRpcStub((res) => {
      res.writeHead(429, { 'Content-Type': 'text/plain' })
      res.end('too many requests')
    })
    const outcome = await probeRpcUrl(url, PROBE_OPTIONS['base-sepolia'])
    expect(outcome.kind).toBe('unavailable')
    expect(livenessGate(outcome)).toBe('skip')
  })

  it('Polygon Amoy posture: HTTP 429 is unavailable/skip (D14)', async () => {
    const url = await startRpcStub((res) => {
      res.writeHead(429, { 'Content-Type': 'text/plain' })
      res.end('too many requests')
    })
    const outcome = await probeRpcUrl(url, PROBE_OPTIONS['polygon-amoy'])
    expect(outcome.kind).toBe('unavailable')
    expect(livenessGate(outcome)).toBe('skip')
  })
})

describe('public RPC availability class (D14)', () => {
  it('HTTP 429 → unavailable skip-class; evaluateLivenessBlock skips (suite green)', async () => {
    const url = await startRpcStub((res) => {
      res.writeHead(429, { 'Content-Type': 'text/plain' })
      res.end('too many requests')
    })
    const outcome = await probeRpcUrl(url, PROBE_OPTIONS['base-sepolia'])
    expect(outcome.kind).toBe('unavailable')
    expect(livenessGate(outcome)).toBe('skip')

    const result = await evaluateLivenessBlock({
      rpcUrl: url,
      networkId: 'base-sepolia',
      expectedChainId: 84532,
      expectedRowCount: 10,
    })
    expect(result).toBe('skipped')
  })

  it('HTTP 403 → unavailable skip-class; evaluateLivenessBlock skips (suite green)', async () => {
    const url = await startRpcStub((res) => {
      res.writeHead(403, { 'Content-Type': 'text/plain' })
      res.end('forbidden')
    })
    const outcome = await probeRpcUrl(url, PROBE_OPTIONS['base-sepolia'])
    expect(outcome.kind).toBe('unavailable')
    expect(livenessGate(outcome)).toBe('skip')

    const result = await evaluateLivenessBlock({
      rpcUrl: url,
      networkId: 'base-sepolia',
      expectedChainId: 84532,
      expectedRowCount: 10,
    })
    expect(result).toBe('skipped')
  })

  it('HTTP 503 → unavailable skip-class; evaluateLivenessBlock skips (suite green)', async () => {
    const url = await startRpcStub((res) => {
      res.writeHead(503, { 'Content-Type': 'text/plain' })
      res.end('unavailable')
    })
    const outcome = await probeRpcUrl(url, PROBE_OPTIONS['base-sepolia'])
    expect(outcome.kind).toBe('unavailable')
    expect(livenessGate(outcome)).toBe('skip')

    const result = await evaluateLivenessBlock({
      rpcUrl: url,
      networkId: 'base-sepolia',
      expectedChainId: 84532,
      expectedRowCount: 10,
    })
    expect(result).toBe('skipped')
  })

  it('JSON-RPC -32005 → unavailable skip-class; evaluateLivenessBlock skips', async () => {
    const url = await startRpcStub((res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32005, message: 'limit exceeded' },
        }),
      )
    })
    const outcome = await probeRpcUrl(url, PROBE_OPTIONS['base-sepolia'])
    expect(outcome.kind).toBe('unavailable')
    expect(livenessGate(outcome)).toBe('skip')

    const result = await evaluateLivenessBlock({
      rpcUrl: url,
      networkId: 'base-sepolia',
      expectedChainId: 84532,
      expectedRowCount: 10,
    })
    expect(result).toBe('skipped')
  })

  it('HTTP 418 → broken (availability class stays narrow); evaluate fails', async () => {
    const url = await startRpcStub((res) => {
      res.writeHead(418, { 'Content-Type': 'text/plain' })
      res.end("I'm a teapot")
    })
    const outcome = await probeRpcUrl(url, PROBE_OPTIONS['base-sepolia'])
    expect(outcome.kind).toBe('broken')
    expect(livenessGate(outcome)).toBe('fail')

    await expect(
      evaluateLivenessBlock({
        rpcUrl: url,
        networkId: 'base-sepolia',
        expectedChainId: 84532,
        expectedRowCount: 10,
      }),
    ).rejects.toThrow(/HTTP 418/)
  })

  it('correct response, wrong chain id → fail', async () => {
    const url = await startJsonRpcStub((method) => {
      if (method === 'eth_chainId') {
        return { body: { jsonrpc: '2.0', id: 1, result: '0x1' } }
      }
      return { body: { jsonrpc: '2.0', id: 1, result: '0x' } }
    })

    const outcome = await probeRpcUrl(url, PROBE_OPTIONS['base-sepolia'])
    expect(outcome.kind).toBe('reachable')
    expect(livenessGate(outcome)).toBe('run')

    await expect(
      evaluateLivenessBlock({
        rpcUrl: url,
        networkId: 'base-sepolia',
        expectedChainId: 84532,
        expectedRowCount: 10,
      }),
    ).rejects.toThrow()
  })

  it('correct chain id, wrong bytecode shape → fail (drift)', async () => {
    const rows = getAddressesForNetwork('base-sepolia')
    const escrow = rows.find((r) => r.role === 'escrow-contract')
    expect(escrow).toBeDefined()

    const url = await startJsonRpcStub((method, params) => {
      if (method === 'eth_chainId') {
        return { body: { jsonrpc: '2.0', id: 1, result: '0x14a34' } } // 84532
      }
      if (method === 'eth_getCode') {
        const address = String(params[0] ?? '').toLowerCase()
        // Escrow should have bytecode; return empty "0x" to simulate drift.
        if (address === escrow!.address.toLowerCase()) {
          return { body: { jsonrpc: '2.0', id: 1, result: '0x' } }
        }
        // EOAs empty; other contracts non-empty so only escrow trips.
        const isContract = rows.some(
          (r) =>
            r.address.toLowerCase() === address && CONTRACT_ROLES.has(r.role),
        )
        return {
          body: {
            jsonrpc: '2.0',
            id: 1,
            result: isContract ? '0x6080604052' : '0x',
          },
        }
      }
      return { body: { jsonrpc: '2.0', id: 1, result: '0x' } }
    })

    const outcome = await probeRpcUrl(url, PROBE_OPTIONS['base-sepolia'])
    expect(outcome.kind).toBe('reachable')

    await expect(
      evaluateLivenessBlock({
        rpcUrl: url,
        networkId: 'base-sepolia',
        expectedChainId: 84532,
        expectedRowCount: PUBLIC_ROWS_PER_NETWORK,
      }),
    ).rejects.toThrow(/expected contract bytecode/)
  })

  it('mid-run HTTP 429 → skipped (availability past the probe)', async () => {
    let getCodeCount = 0
    const url = await startJsonRpcStub((method) => {
      if (method === 'eth_chainId') {
        return { body: { jsonrpc: '2.0', id: 1, result: '0x14a34' } }
      }
      if (method === 'eth_getCode') {
        getCodeCount += 1
        if (getCodeCount === 1) {
          return { body: { jsonrpc: '2.0', id: 1, result: '0x6080604052' } }
        }
        return { status: 429, body: { error: 'too many requests' } }
      }
      return { body: { jsonrpc: '2.0', id: 1, result: '0x' } }
    })

    const outcome = await probeRpcUrl(url, PROBE_OPTIONS['base-sepolia'])
    expect(outcome.kind).toBe('reachable')

    const result = await evaluateLivenessBlock({
      rpcUrl: url,
      networkId: 'base-sepolia',
      expectedChainId: 84532,
      expectedRowCount: PUBLIC_ROWS_PER_NETWORK,
    })
    expect(result).toBe('skipped')
  })

  it('mid-run JSON-RPC -32005 → skipped (availability past the probe)', async () => {
    let getCodeCount = 0
    const url = await startJsonRpcStub((method) => {
      if (method === 'eth_chainId') {
        return { body: { jsonrpc: '2.0', id: 1, result: '0x14a34' } }
      }
      if (method === 'eth_getCode') {
        getCodeCount += 1
        if (getCodeCount === 1) {
          return { body: { jsonrpc: '2.0', id: 1, result: '0x6080604052' } }
        }
        return {
          body: {
            jsonrpc: '2.0',
            id: 1,
            error: { code: -32005, message: 'limit exceeded' },
          },
        }
      }
      return { body: { jsonrpc: '2.0', id: 1, result: '0x' } }
    })

    const outcome = await probeRpcUrl(url, PROBE_OPTIONS['base-sepolia'])
    expect(outcome.kind).toBe('reachable')

    const result = await evaluateLivenessBlock({
      rpcUrl: url,
      networkId: 'base-sepolia',
      expectedChainId: 84532,
      expectedRowCount: PUBLIC_ROWS_PER_NETWORK,
    })
    expect(result).toBe('skipped')
  })

  it('mid-run wrong bytecode shape → fail (skip path must not swallow drift)', async () => {
    const rows = getAddressesForNetwork('base-sepolia')
    // Escrow is row 0; trip a later contract so some getCode calls succeed first.
    const midContract = rows.find((r) => r.role === 'token-contract')
    expect(midContract).toBeDefined()

    const url = await startJsonRpcStub((method, params) => {
      if (method === 'eth_chainId') {
        return { body: { jsonrpc: '2.0', id: 1, result: '0x14a34' } }
      }
      if (method === 'eth_getCode') {
        const address = String(params[0] ?? '').toLowerCase()
        if (address === midContract!.address.toLowerCase()) {
          return { body: { jsonrpc: '2.0', id: 1, result: '0x' } }
        }
        const isContract = rows.some(
          (r) =>
            r.address.toLowerCase() === address && CONTRACT_ROLES.has(r.role),
        )
        return {
          body: {
            jsonrpc: '2.0',
            id: 1,
            result: isContract ? '0x6080604052' : '0x',
          },
        }
      }
      return { body: { jsonrpc: '2.0', id: 1, result: '0x' } }
    })

    await expect(
      evaluateLivenessBlock({
        rpcUrl: url,
        networkId: 'base-sepolia',
        expectedChainId: 84532,
        expectedRowCount: PUBLIC_ROWS_PER_NETWORK,
      }),
    ).rejects.toThrow(/expected contract bytecode/)
  })

  it('mid-run plain HTTP 500 → fail (500 is outside availability class)', async () => {
    let getCodeCount = 0
    const url = await startJsonRpcStub((method) => {
      if (method === 'eth_chainId') {
        return { body: { jsonrpc: '2.0', id: 1, result: '0x14a34' } }
      }
      if (method === 'eth_getCode') {
        getCodeCount += 1
        if (getCodeCount === 1) {
          return { body: { jsonrpc: '2.0', id: 1, result: '0x6080604052' } }
        }
        return { status: 500, body: { error: 'internal server error' } }
      }
      return { body: { jsonrpc: '2.0', id: 1, result: '0x' } }
    })

    await expect(
      evaluateLivenessBlock({
        rpcUrl: url,
        networkId: 'base-sepolia',
        expectedChainId: 84532,
        expectedRowCount: PUBLIC_ROWS_PER_NETWORK,
      }),
    ).rejects.toThrow(/RPC HTTP 500/)
  })
})

describe('public suite timeout budget', () => {
  it('PUBLIC_SUITE_TIMEOUT_MS covers per-request budget for all public rows', () => {
    expect(PUBLIC_ROWS_PER_NETWORK).toBe(
      getAddressesForNetwork('base-sepolia').length,
    )
    expect(PUBLIC_ROWS_PER_NETWORK).toBe(
      getAddressesForNetwork('polygon-amoy').length,
    )
    expect(PUBLIC_LIVENESS_RPC_CALLS).toBe(PUBLIC_ROWS_PER_NETWORK + 3)
    expect(PUBLIC_SUITE_TIMEOUT_MS).toBeGreaterThanOrEqual(
      PUBLIC_RPC_TIMEOUT_MS * PUBLIC_LIVENESS_RPC_CALLS,
    )
  })
})

/**
 * Helpers for getLogs capability stub tests — healthy chainId + getCode for every
 * row, then a custom eth_getLogs (and eth_blockNumber) response.
 */
function healthyPublicLivenessStub(opts: {
  onGetLogs: () => { status?: number; body: unknown }
  onBlockNumber?: () => { status?: number; body: unknown }
  captureGetLogs?: (params: unknown[]) => void
}): (method: string, params: unknown[]) => { status?: number; body: unknown } {
  const rows = getAddressesForNetwork('base-sepolia')
  return (method, params) => {
    if (method === 'eth_chainId') {
      return { body: { jsonrpc: '2.0', id: 1, result: '0x14a34' } }
    }
    if (method === 'eth_getCode') {
      const address = String(params[0] ?? '').toLowerCase()
      const isContract = rows.some(
        (r) =>
          r.address.toLowerCase() === address && CONTRACT_ROLES.has(r.role),
      )
      return {
        body: {
          jsonrpc: '2.0',
          id: 1,
          result: isContract ? '0x6080604052' : '0x',
        },
      }
    }
    if (method === 'eth_blockNumber') {
      if (opts.onBlockNumber) return opts.onBlockNumber()
      // High enough that fromBlock..toBlock span equals LOG_CHUNK.
      return { body: { jsonrpc: '2.0', id: 1, result: '0x10000' } }
    }
    if (method === 'eth_getLogs') {
      opts.captureGetLogs?.(params)
      return opts.onGetLogs()
    }
    return { body: { jsonrpc: '2.0', id: 1, result: '0x' } }
  }
}

describe('eth_getLogs capability (F6r)', () => {
  it('issues eth_getLogs over a span equal to LOG_CHUNK', async () => {
    let captured: unknown[] | undefined
    const url = await startJsonRpcStub(
      healthyPublicLivenessStub({
        captureGetLogs: (params) => {
          captured = params
        },
        onGetLogs: () => ({
          body: { jsonrpc: '2.0', id: 1, result: [] },
        }),
      }),
    )

    const span = await assertEthGetLogsCapability({
      rpcUrl: url,
      tokenAddress: '0x2066738d535681d28d0841cc2503c1c531d4d6aa',
    })
    expect(span.toBlock - span.fromBlock + 1n).toBe(LOG_CHUNK)
    expect(captured).toBeDefined()
    const filter = captured![0] as {
      fromBlock: string
      toBlock: string
      topics: string[]
    }
    expect(BigInt(filter.fromBlock)).toBe(span.fromBlock)
    expect(BigInt(filter.toBlock)).toBe(span.toBlock)
    expect(filter.topics[0]).toBe(TRANSFER_EVENT_TOPIC)
  })

  it('range-limit rejection on eth_getLogs fails the liveness suite (does not skip)', async () => {
    const url = await startJsonRpcStub(
      healthyPublicLivenessStub({
        onGetLogs: () => ({
          body: {
            jsonrpc: '2.0',
            id: 1,
            // Same shape thirdweb used for range rejection (D15) — must fail, not skip.
            error: { code: -32005, message: 'block range too large' },
          },
        }),
      }),
    )

    await expect(
      evaluateLivenessBlock({
        rpcUrl: url,
        networkId: 'base-sepolia',
        expectedChainId: 84532,
        expectedRowCount: PUBLIC_ROWS_PER_NETWORK,
      }),
    ).rejects.toThrow(/eth_getLogs/)
  })

  it('HTTP 429 on eth_getLogs still skips (availability class)', async () => {
    const url = await startJsonRpcStub(
      healthyPublicLivenessStub({
        onGetLogs: () => ({
          status: 429,
          body: { error: 'too many requests' },
        }),
      }),
    )

    const result = await evaluateLivenessBlock({
      rpcUrl: url,
      networkId: 'base-sepolia',
      expectedChainId: 84532,
      expectedRowCount: PUBLIC_ROWS_PER_NETWORK,
    })
    expect(result).toBe('skipped')
  })

  it('empty eth_getLogs array is healthy (does not require Transfer events)', async () => {
    const url = await startJsonRpcStub(
      healthyPublicLivenessStub({
        onGetLogs: () => ({
          body: { jsonrpc: '2.0', id: 1, result: [] },
        }),
      }),
    )

    const result = await evaluateLivenessBlock({
      rpcUrl: url,
      networkId: 'base-sepolia',
      expectedChainId: 84532,
      expectedRowCount: PUBLIC_ROWS_PER_NETWORK,
    })
    expect(result).toBe('passed')
  })
})
