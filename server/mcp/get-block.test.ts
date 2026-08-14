import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import {
  BlockNotFoundError,
  createPublicClient,
  custom,
  defineChain,
  HttpRequestError,
} from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cacheClear } from '../../src/lib/cache'
import { createExplorerMcpServer } from './server.ts'

const BLOCK_NUMBER = 979_595n
const BLOCK_HASH =
  '0x08fed8e2421fae5dfc513fa645518806e87dcbcbb155b4c81e98661d3dcf08cc' as const
const PARENT_HASH =
  '0x000306c145c4fd3dbc247a1f9104f8bce88d5fb47798a77ac5f84b9c67a9f6ad' as const
const SETTLEMENT_HASH =
  '0x876325b24398a3b08bc1abd6901bced99b2ad7e254f427e7b6ef5817288045c7' as const
const DEPOSIT_HASH =
  '0x1bafb919a9d9d838aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const
const OPERATOR = '0x5128889F20Ec13e0Be38b2BeBC568594159B652d'
const ESCROW = '0x9d8b8b7c476ab02306046f3da719d380fa0456aa'
const DEPOSITOR = '0xdeaddeaddeaddeaddeaddeaddeaddeaddead0001'
const L1_ATTRS = '0x4200000000000000000000000000000000000015'
const MINER = '0x4200000000000000000000000000000000000011'
const HEAD = 1_025_580n
const PAST_HEAD = '9999999'

const mocks = vi.hoisted(() => {
  const getBlock = vi.fn()
  const getBlockNumber = vi.fn()
  const getPublicClient = vi.fn(() => ({
    getBlock,
    getBlockNumber,
  }))
  return { getBlock, getBlockNumber, getPublicClient }
})

vi.mock('../../src/lib/clients', () => ({
  getPublicClient: mocks.getPublicClient,
}))

type ToolSession = {
  client: Client
  close: () => Promise<void>
}

const sessions: ToolSession[] = []

afterEach(async () => {
  // Test isolation only. Production server/ never calls cacheClear (PLAN §4).
  cacheClear()
  vi.clearAllMocks()
  mocks.getPublicClient.mockImplementation(() => ({
    getBlock: mocks.getBlock,
    getBlockNumber: mocks.getBlockNumber,
  }))
  while (sessions.length) {
    const session = sessions.pop()
    if (session) await session.close()
  }
})

async function connectClient(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const mcp = createExplorerMcpServer()
  const client = new Client({ name: 'get-block-test', version: '1.0.0' })
  await Promise.all([
    mcp.connect(serverTransport),
    client.connect(clientTransport),
  ])
  const session: ToolSession = {
    client,
    close: async () => {
      await client.close()
      await mcp.close()
    },
  }
  sessions.push(session)
  return client
}

type ToolCallResult = {
  isError?: boolean
  content: Array<{ type: string; text?: string }>
}

function parseTool(result: unknown) {
  const typed = result as ToolCallResult
  const text = typed.content.find((c) => c.type === 'text')?.text
  if (!text) throw new Error('Missing tool text content')
  return {
    isError: typed.isError,
    text,
    payload: JSON.parse(text) as Record<string, unknown>,
  }
}

function toolText(result: unknown): string {
  const typed = result as ToolCallResult
  return typed.content.find((c) => c.type === 'text')?.text ?? ''
}

function depositTx() {
  return {
    hash: DEPOSIT_HASH,
    from: DEPOSITOR,
    to: L1_ATTRS,
    value: 0n,
    type: undefined,
  }
}

function settlementTx() {
  return {
    hash: SETTLEMENT_HASH,
    from: OPERATOR,
    to: ESCROW,
    value: 0n,
    type: 'eip1559',
  }
}

function fullBlock(overrides: Record<string, unknown> = {}) {
  return {
    number: BLOCK_NUMBER,
    hash: BLOCK_HASH,
    parentHash: PARENT_HASH,
    timestamp: 1_786_642_114n,
    gasUsed: 106_805n,
    gasLimit: 60_000_000n,
    baseFeePerGas: 251n,
    miner: MINER,
    transactions: [depositTx(), settlementTx()],
    ...overrides,
  }
}

describe('get_block', () => {
  it('returns toolError and issues zero transport requests for a malformed blockNumberOrHash', async () => {
    let transportCalls = 0
    const dummy = defineChain({
      id: 852,
      name: 'ForteL2 Sepolia',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: ['http://127.0.0.1:9545'] } },
    })
    mocks.getPublicClient.mockReturnValue(
      createPublicClient({
        chain: dummy,
        transport: custom({
          async request() {
            transportCalls += 1
            return null
          },
        }),
      }) as never,
    )

    const client = await connectClient()
    const result = (await client.callTool({
      name: 'get_block',
      arguments: {
        networkId: 'fortel2-sepolia',
        blockNumberOrHash: 'not-a-block',
      },
    })) as ToolCallResult

    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'Invalid blockNumberOrHash. Expected a decimal block number or a 0x-prefixed 32-byte block hash.',
    })
    expect(transportCalls).toBe(0)
    expect(mocks.getPublicClient).not.toHaveBeenCalled()
    expect(mocks.getBlock).not.toHaveBeenCalled()
  })

  it('returns toolError and issues zero transport requests for an invalid networkId', async () => {
    const client = await connectClient()
    const result = (await client.callTool({
      name: 'get_block',
      arguments: {
        networkId: 'not-a-network',
        blockNumberOrHash: '979595',
      },
    })) as ToolCallResult

    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'Invalid networkId. Use one of: base-sepolia, fortel2-sepolia, polygon-amoy',
    })
    expect(mocks.getPublicClient).not.toHaveBeenCalled()
    expect(mocks.getBlock).not.toHaveBeenCalled()
  })

  it('returns not_found as a structured answer with isError not true and no otherNetworks', async () => {
    mocks.getBlock.mockRejectedValue(
      new BlockNotFoundError({ blockNumber: 9_999_999n }),
    )

    const client = await connectClient()
    const result = (await client.callTool({
      name: 'get_block',
      arguments: {
        networkId: 'fortel2-sepolia',
        blockNumberOrHash: PAST_HEAD,
      },
    })) as ToolCallResult

    expect(result.isError).not.toBe(true)
    const parsed = parseTool(result)
    expect(parsed.payload).toEqual({
      status: 'not_found',
      networkId: 'fortel2-sepolia',
      queried: PAST_HEAD,
      hint: 'This node may not have this block yet, or its history may be pruned.',
    })
    expect(parsed.payload).not.toHaveProperty('otherNetworks')
  })

  it('returns isError true on transport failure and does not collapse it into not_found', async () => {
    mocks.getBlock.mockRejectedValue(
      new HttpRequestError({
        url: 'http://127.0.0.1:9545',
        body: {},
        details: 'fetch failed',
      }),
    )

    const client = await connectClient()
    const result = (await client.callTool({
      name: 'get_block',
      arguments: {
        networkId: 'fortel2-sepolia',
        blockNumberOrHash: '979595',
      },
    })) as ToolCallResult

    expect(result.isError).toBe(true)
    const text = toolText(result)
    expect(text).toMatch(/fetch failed|HTTP request failed/i)
    expect(text).not.toMatch(/not_found/)
  })

  it('serializes the deposit row type as an own-property null, not a missing key', async () => {
    mocks.getBlock.mockResolvedValue(fullBlock())
    mocks.getBlockNumber.mockResolvedValue(HEAD)

    const client = await connectClient()
    const result = await client.callTool({
      name: 'get_block',
      arguments: {
        networkId: 'fortel2-sepolia',
        blockNumberOrHash: '979595',
      },
    })
    const parsed = parseTool(result)
    const rows = parsed.payload.transactions as Array<Record<string, unknown>>
    const deposit = rows[0]

    expect(parsed.isError).not.toBe(true)
    expect(deposit.hash).toBe(DEPOSIT_HASH)
    expect('type' in deposit).toBe(true)
    expect(deposit.type).toBe(null)
    expect(rows[1]?.type).toBe('eip1559')
  })

  it('returns a found payload whose bigints JSON-parse as decimal strings', async () => {
    mocks.getBlock.mockResolvedValue(fullBlock())
    mocks.getBlockNumber.mockResolvedValue(HEAD)

    const client = await connectClient()
    const result = await client.callTool({
      name: 'get_block',
      arguments: {
        networkId: 'fortel2-sepolia',
        blockNumberOrHash: '979595',
      },
    })
    const parsed = parseTool(result)
    const rows = parsed.payload.transactions as unknown[]

    expect(parsed.isError).not.toBe(true)
    expect(parsed.payload.status).toBe('found')
    expect(parsed.payload.networkId).toBe('fortel2-sepolia')
    expect(parsed.payload.number).toBe('979595')
    expect(parsed.payload.hash).toBe(BLOCK_HASH)
    expect(parsed.payload.parentHash).toBe(PARENT_HASH)
    expect(parsed.payload.timestamp).toBe(1_786_642_114)
    expect(parsed.payload.gasUsed).toBe('106805')
    expect(parsed.payload.gasLimit).toBe('60000000')
    expect(parsed.payload.baseFeePerGas).toBe('251')
    expect(parsed.payload.head).toBe('1025580')
    expect(parsed.payload.miner).toEqual({
      address: MINER,
      label: '0x4200…0011',
    })
    expect(parsed.payload.txCount).toBe(2)
    expect(rows).toHaveLength(2)
    expect(parsed.payload.txCount).toBe(rows.length)
    expect(rows[1]).toMatchObject({
      hash: SETTLEMENT_HASH,
      from: { address: OPERATOR, label: 'Operator' },
      to: { address: ESCROW, label: 'PaymentSettlement' },
      value: '0',
      type: 'eip1559',
    })
  })

  it('resolves the same block through a number param and a hash param', async () => {
    mocks.getBlock.mockResolvedValue(fullBlock())
    mocks.getBlockNumber.mockResolvedValue(HEAD)

    const client = await connectClient()
    const byNumber = parseTool(
      await client.callTool({
        name: 'get_block',
        arguments: {
          networkId: 'fortel2-sepolia',
          blockNumberOrHash: '979595',
        },
      }),
    )
    const byHash = parseTool(
      await client.callTool({
        name: 'get_block',
        arguments: {
          networkId: 'fortel2-sepolia',
          blockNumberOrHash: BLOCK_HASH,
        },
      }),
    )

    expect(byNumber.payload.number).toBe(byHash.payload.number)
    expect(byNumber.payload.hash).toBe(byHash.payload.hash)
    expect(byNumber.payload.txCount).toBe(byHash.payload.txCount)
    expect(byNumber.payload.transactions).toEqual(byHash.payload.transactions)
    expect(mocks.getBlock).toHaveBeenNthCalledWith(1, {
      blockNumber: BLOCK_NUMBER,
      includeTransactions: true,
    })
    expect(mocks.getBlock).toHaveBeenNthCalledWith(2, {
      blockHash: BLOCK_HASH,
      includeTransactions: true,
    })
  })
})
