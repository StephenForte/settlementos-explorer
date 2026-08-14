import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import {
  createPublicClient,
  custom,
  defineChain,
  encodeAbiParameters,
  encodeEventTopics,
  HttpRequestError,
  TransactionNotFoundError,
  type Hex,
  type Log,
} from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { erc20Abi, paymentSettlementEventsAbi } from '../../src/config/abis'
import { cacheClear } from '../../src/lib/cache'
import { createExplorerMcpServer } from './server.ts'

const HASH =
  '0x876325b24398a3b08bc1abd6901bced99b2ad7e254f427e7b6ef5817288045c7' as const
const NOT_FOUND_HASH = ('0x' + '11'.repeat(32)) as Hex
const TRANSPORT_HASH = ('0x' + '22'.repeat(32)) as Hex
const PENDING_HASH = ('0x' + '33'.repeat(32)) as Hex
const OPERATOR = '0x5128889F20Ec13e0Be38b2BeBC568594159B652d'
const ESCROW = '0x9d8b8b7c476ab02306046f3da719d380fa0456aa'
const TREASURY = '0x1E4ee7a078Bd40d1982dF1978C046f8cD0D1D3AA'
const MOCK_USDC = '0x2066738d535681d28d0841cc2503c1c531d4d6aa'
const PAYMENT_ID = ('0x' + 'aa'.repeat(32)) as Hex
const ROUTE_ID = ('0x' + 'bb'.repeat(32)) as Hex

const mocks = vi.hoisted(() => {
  const getTransaction = vi.fn()
  const getTransactionReceipt = vi.fn()
  const getBlock = vi.fn()
  const getBlockNumber = vi.fn()
  const getPublicClient = vi.fn(() => ({
    getTransaction,
    getTransactionReceipt,
    getBlock,
    getBlockNumber,
  }))
  return {
    getTransaction,
    getTransactionReceipt,
    getBlock,
    getBlockNumber,
    getPublicClient,
  }
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
    getTransaction: mocks.getTransaction,
    getTransactionReceipt: mocks.getTransactionReceipt,
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
  const client = new Client({ name: 'get-transaction-test', version: '1.0.0' })
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

function logFrom(address: string, topics: Hex[], data: Hex): Log {
  return {
    address: address as Log['address'],
    topics: topics as Log['topics'],
    data,
    blockHash: HASH,
    blockNumber: 979595n,
    transactionHash: HASH,
    transactionIndex: 1,
    logIndex: 0,
    removed: false,
  }
}

function transferLog(token: string, from: string, to: string, value: bigint): Log {
  const topics = encodeEventTopics({
    abi: erc20Abi,
    eventName: 'Transfer',
    args: { from: from as `0x${string}`, to: to as `0x${string}` },
  })
  const data = encodeAbiParameters([{ type: 'uint256' }], [value])
  return logFrom(token, topics as Hex[], data)
}

function paymentSettledLog(): Log {
  const topics = encodeEventTopics({
    abi: paymentSettlementEventsAbi,
    eventName: 'PaymentSettled',
    args: { paymentId: PAYMENT_ID },
  })
  const data = encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'uint256' }, { type: 'string' }],
    [ROUTE_ID, 15_668_160n, 'mockJPY'],
  )
  return logFrom(ESCROW, topics as Hex[], data)
}

function minedTx(hash: Hex = HASH) {
  return {
    hash,
    from: OPERATOR,
    to: ESCROW,
    value: 0n,
    nonce: 30,
    input: (`0xfc216bc9${'ab'.repeat(224)}`) as Hex,
    gas: 54_383n,
    blockNumber: 979_595n,
    transactionIndex: 1,
    type: 'eip1559',
  }
}

function minedReceipt(logs: Log[]) {
  return {
    status: 'success' as const,
    gasUsed: 49_387n,
    effectiveGasPrice: 1_000_251n,
    contractAddress: null,
    logs,
  }
}

describe('get_transaction', () => {
  it('returns toolError and issues zero transport requests for a malformed txHash', async () => {
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
      name: 'get_transaction',
      arguments: { networkId: 'fortel2-sepolia', txHash: 'not-a-hash' },
    })) as ToolCallResult

    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'Invalid txHash. Expected a 0x-prefixed 32-byte hex string.',
    })
    expect(transportCalls).toBe(0)
    expect(mocks.getPublicClient).not.toHaveBeenCalled()
    expect(mocks.getTransaction).not.toHaveBeenCalled()
  })

  it('returns toolError and issues zero transport requests for an invalid networkId', async () => {
    const client = await connectClient()
    const result = (await client.callTool({
      name: 'get_transaction',
      arguments: { networkId: 'not-a-network', txHash: HASH },
    })) as ToolCallResult

    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'Invalid networkId. Use one of: base-sepolia, fortel2-sepolia, polygon-amoy',
    })
    expect(mocks.getPublicClient).not.toHaveBeenCalled()
    expect(mocks.getTransaction).not.toHaveBeenCalled()
  })

  it('returns not_found as a structured answer with isError not true', async () => {
    mocks.getTransaction.mockRejectedValue(
      new TransactionNotFoundError({ hash: NOT_FOUND_HASH }),
    )

    const client = await connectClient()
    const result = (await client.callTool({
      name: 'get_transaction',
      arguments: { networkId: 'fortel2-sepolia', txHash: NOT_FOUND_HASH },
    })) as ToolCallResult

    expect(result.isError).not.toBe(true)
    const parsed = parseTool(result)
    expect(parsed.payload).toEqual({
      status: 'not_found',
      networkId: 'fortel2-sepolia',
      txHash: NOT_FOUND_HASH,
      otherNetworks: ['base-sepolia', 'polygon-amoy'],
    })
  })

  it('returns isError true on transport failure and does not collapse it into not_found', async () => {
    mocks.getTransaction.mockRejectedValue(
      new HttpRequestError({
        url: 'http://127.0.0.1:9545',
        body: {},
        details: 'fetch failed',
      }),
    )

    const client = await connectClient()
    const result = (await client.callTool({
      name: 'get_transaction',
      arguments: { networkId: 'fortel2-sepolia', txHash: TRANSPORT_HASH },
    })) as ToolCallResult

    expect(result.isError).toBe(true)
    const text = toolText(result)
    expect(text).toMatch(/fetch failed|HTTP request failed/i)
    expect(text).not.toMatch(/not_found/)
  })

  it('returns a mined payload whose fee JSON-parses as the decimal string 49399396137', async () => {
    const logs = [
      transferLog(MOCK_USDC, ESCROW, TREASURY, 100_000_000_000n),
      paymentSettledLog(),
    ]
    mocks.getTransaction.mockResolvedValue(minedTx())
    mocks.getTransactionReceipt.mockResolvedValue(minedReceipt(logs))
    mocks.getBlock.mockResolvedValue({ timestamp: 1_786_642_114n })
    mocks.getBlockNumber.mockResolvedValue(1_024_382n)

    const client = await connectClient()
    const result = await client.callTool({
      name: 'get_transaction',
      arguments: { networkId: 'fortel2-sepolia', txHash: HASH },
    })
    const parsed = parseTool(result)

    expect(parsed.isError).not.toBe(true)
    expect(parsed.payload.status).toBe('mined')
    expect(parsed.payload.receiptStatus).toBe('success')
    expect(parsed.payload.blockNumber).toBe('979595')
    expect(parsed.payload.l2ExecutionFeeWei).toBe('49399396137')
    expect(parsed.payload.l2ExecutionFeeGwei).toBe('49.399396137')
    expect(parsed.payload.from).toEqual({
      address: OPERATOR,
      label: 'Operator',
    })
    expect(parsed.payload.to).toEqual({
      address: ESCROW,
      label: 'PaymentSettlement',
    })
    expect(parsed.payload.input).toEqual({
      kind: 'call',
      selector: '0xfc216bc9',
      byteLength: 228,
    })
    const decoded = parsed.payload.logs as Array<Record<string, unknown>>
    expect(decoded).toHaveLength(2)
    expect(decoded[0]).toMatchObject({
      kind: 'erc20-transfer',
      fromLabel: 'PaymentSettlement',
      toLabel: 'Treasury',
      amountRaw: '100000000000',
    })
    expect(decoded[1]).toMatchObject({
      kind: 'escrow',
      eventName: 'PaymentSettled',
      detail: 'settled as mockJPY',
    })
  })

  it('returns pending without fee or confirmations keys', async () => {
    mocks.getTransaction.mockResolvedValue({
      ...minedTx(PENDING_HASH),
      blockNumber: null,
      transactionIndex: null,
    })

    const client = await connectClient()
    const result = await client.callTool({
      name: 'get_transaction',
      arguments: { networkId: 'fortel2-sepolia', txHash: PENDING_HASH },
    })
    const parsed = parseTool(result)

    expect(parsed.isError).not.toBe(true)
    expect(parsed.payload.status).toBe('pending')
    expect(parsed.payload.txHash).toBe(PENDING_HASH)
    expect(parsed.payload).not.toHaveProperty('l2ExecutionFeeWei')
    expect(parsed.payload).not.toHaveProperty('l2ExecutionFeeGwei')
    expect(parsed.payload).not.toHaveProperty('confirmations')
    expect(parsed.payload).not.toHaveProperty('receiptStatus')
    expect(parsed.payload).not.toHaveProperty('gasUsed')
    expect(parsed.payload).not.toHaveProperty('blockNumber')
  })
})
