import { createPublicClient, fallback, http, type Address } from 'viem'
import type { NetworkId } from '../config/networks'
import { resolveRpcUrls } from '../lib/clients'
import { getRpcOverride } from '../lib/rpc-overrides'

const STATE_PROBE_LIMIT = 2048
const FULL_BLOCK_LIMIT = 512
const INTERVALS_PER_WAVE = 8

type State = { height: bigint; nonce: number; balance: bigint }
type Interval = { older: State; newer: State }

export function createNativeHistoryClient(networkId: NetworkId) {
  // Keep archive traffic in its own batches so log queries cannot delay a
  // batch containing the state or block needed for the first native rows.
  // User-supplied endpoints may support single requests only.
  const batch = getRpcOverride(networkId) ? false : { batchSize: 32 }
  return createPublicClient({
    transport: fallback(
      resolveRpcUrls(networkId).map((url) =>
        http(url, { batch, retryCount: 0, timeout: 12_000 }),
      ),
      { retryCount: 0 },
    ),
  })
}

export async function discoverNativeHistory(
  client: ReturnType<typeof createNativeHistoryClient>,
  address: Address,
  onBlock: (block: Awaited<ReturnType<typeof client.getBlock>>) => void,
) {
  const tip = await client.getBlockNumber()
  // Compare end-of-block states at a fixed head. Some pruned endpoints only
  // accept the latest tag, which still provides the expected count for the UI.
  let expected: number
  try {
    expected = await client.getTransactionCount({ address, blockNumber: tip })
  } catch {
    expected = await client.getTransactionCount({ address, blockTag: 'latest' })
    return { expected, problems: ['the RPC could not read a nonce at a fixed block'] }
  }
  const problems = new Set<string>()
  let probes = 0
  let blocks = 0

  async function stateAt(height: bigint): Promise<State | undefined> {
    if (probes >= STATE_PROBE_LIMIT) {
      problems.add('native history state-probe limit reached')
      return
    }
    probes++
    try {
      const [nonce, balance] = await Promise.all([
        height === tip
          ? expected
          : client.getTransactionCount({ address, blockNumber: height }),
        client.getBalance({ address, blockNumber: height }),
      ])
      return { height, nonce, balance }
    } catch {
      problems.add('some historical account states were unavailable from the RPC')
    }
  }

  const intervals: Interval[] = []
  const ready: bigint[] = []
  function enqueue(older: State, newer: State) {
    if (older.nonce > newer.nonce) {
      problems.add('the RPC returned inconsistent historical nonces')
    }
    if (older.nonce === newer.nonce && older.balance === newer.balance) return
    if (newer.height - older.height === 1n) {
      ready.push(newer.height)
    } else {
      intervals.push({ older, newer })
    }
  }

  // Favor the most recent activity without giving up the genesis-to-head
  // search. Missing archive state at one anchor leaves other brackets usable.
  const anchors = [0n, tip - 65_536n, tip - 4_096n, tip - 64n, tip]
  const states = (await Promise.all(
    [...new Set(anchors.filter((height) => height >= 0n))].map(stateAt),
  )).filter((state): state is State => state !== undefined)
  for (let index = 1; index < states.length; index++) {
    enqueue(states[index - 1]!, states[index]!)
  }

  async function fetchReadyBlocks() {
    await Promise.all(ready.splice(0).map(async (blockNumber) => {
      if (blocks >= FULL_BLOCK_LIMIT) {
        problems.add('native history full-block limit reached')
        return
      }
      blocks++
      try {
        const block = await client.getBlock({ blockNumber, includeTransactions: true })
        if (block.number !== blockNumber || block.transactions.some((tx) => typeof tx === 'string')) {
          problems.add('the RPC returned incomplete transaction data for a block')
          return
        }
        onBlock(block)
      } catch {
        problems.add('some native transaction blocks were unavailable from the RPC')
      }
    }))
  }

  while (ready.length > 0 || intervals.length > 0) {
    await fetchReadyBlocks()
    intervals.sort((a, b) => Number(b.newer.height - a.newer.height))
    const wave = intervals.splice(0, INTERVALS_PER_WAVE)
    await Promise.all(wave.map(async ({ older, newer }) => {
      // Split in quarters to reduce round trips on the critical path.
      const width = newer.height - older.height
      const heights = [...new Set([1n, 2n, 3n].map((part) =>
        older.height + width * part / 4n,
      ))].filter((height) => height > older.height)
      const midpoints = await Promise.all(heights.map(stateAt))
      const boundaries = [older, ...midpoints, newer]
      for (let index = 1; index < boundaries.length; index++) {
        const left = boundaries[index - 1]
        const right = boundaries[index]
        if (left && right) enqueue(left, right)
      }
    }))
  }

  return { expected, problems: [...problems] }
}
