/**
 * MCP server for SettlementOS Explorer (read-only public chain data).
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'
import { getBalances } from '../../src/chain/balances.ts'
import { getTransfers } from '../../src/chain/transfers.ts'
import {
  ADDRESS_BOOK,
  ENTITIES,
  getAddressesForNetwork,
  getEntity,
  getEntityWallets,
  isEntityId,
  lookupAddress,
  type AddressRole,
} from '../../src/config/address-book.ts'
import {
  isNetworkId,
  NETWORK_IDS,
  NETWORKS,
  type NetworkId,
} from '../../src/config/networks.ts'
import { textJson, toolError, toJsonSafe } from './json.ts'

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/
const ROLES = [
  'escrow-contract',
  'token-contract',
  'operator',
  'treasury',
  'entity',
] as const satisfies readonly AddressRole[]

function parseNetworkId(value: string | undefined): NetworkId | null {
  if (!value) return null
  return isNetworkId(value) ? value : null
}

export function filterAddressBook(filters: {
  networkId?: string
  role?: string
  labelContains?: string
}) {
  const networkId = filters.networkId?.trim()
  const role = filters.role?.trim().toLowerCase()
  const labelContains = filters.labelContains?.trim().toLowerCase()

  return ADDRESS_BOOK.filter((entry) => {
    if (networkId && entry.networkId !== networkId) return false
    if (role && entry.role !== role) return false
    if (
      labelContains &&
      !entry.label.toLowerCase().includes(labelContains) &&
      !(entry.entityId?.toLowerCase().includes(labelContains) ?? false)
    ) {
      return false
    }
    return true
  }).map((entry) => ({
    address: entry.address,
    role: entry.role,
    label: entry.label,
    networkId: entry.networkId,
    entityId: entry.entityId ?? null,
    token: entry.token ?? null,
  }))
}

export function summarizeExplorer() {
  const byNetwork: Record<string, number> = {}
  const byRole: Record<string, number> = {}
  for (const entry of ADDRESS_BOOK) {
    byNetwork[entry.networkId] = (byNetwork[entry.networkId] || 0) + 1
    byRole[entry.role] = (byRole[entry.role] || 0) + 1
  }
  return {
    networks: NETWORK_IDS.map((id) => ({
      id,
      name: NETWORKS[id].name,
      chainId: NETWORKS[id].chainId,
      addressCount: byNetwork[id] || 0,
    })),
    totalAddresses: ADDRESS_BOOK.length,
    byRole,
    entities: ENTITIES,
  }
}

export function createExplorerMcpServer(): McpServer {
  const server = new McpServer({
    name: 'settlementos-explorer',
    version: '0.1.0',
  })

  server.registerTool(
    'list_networks',
    {
      title: 'List networks',
      description:
        'List supported SettlementOS explorer networks (Base Sepolia, Polygon Amoy).',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      textJson([
        {
          networks: NETWORK_IDS.map((id) => NETWORKS[id]),
        },
      ]),
  )

  server.registerTool(
    'list_addresses',
    {
      title: 'List addresses',
      description:
        'List the bundled SettlementOS address book (public addresses only). Optional filters.',
      inputSchema: {
        networkId: z
          .string()
          .optional()
          .describe('base-sepolia | polygon-amoy'),
        role: z
          .enum(ROLES)
          .optional()
          .describe('Address role filter'),
        labelContains: z
          .string()
          .optional()
          .describe('Substring match on label or entityId'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ networkId, role, labelContains }) => {
      if (networkId && !isNetworkId(networkId)) {
        return toolError(
          `Invalid networkId. Use one of: ${NETWORK_IDS.join(', ')}`,
        )
      }
      return textJson([
        { addresses: filterAddressBook({ networkId, role, labelContains }) },
      ])
    },
  )

  server.registerTool(
    'get_balances',
    {
      title: 'Get balances',
      description:
        'Read native + known token balances for an address on a network (public RPC).',
      inputSchema: {
        networkId: z.string().describe('base-sepolia | polygon-amoy'),
        address: z.string().describe('0x… address'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ networkId, address }) => {
      const net = parseNetworkId(networkId)
      if (!net) {
        return toolError(
          `Invalid networkId. Use one of: ${NETWORK_IDS.join(', ')}`,
        )
      }
      if (!ADDRESS_RE.test(address)) {
        return toolError('Invalid address. Expected 0x + 40 hex chars.')
      }
      try {
        const balances = await getBalances(net, address)
        const entry = lookupAddress(net, address)
        return textJson([
          {
            label: entry?.label ?? null,
            role: entry?.role ?? null,
            entityId: entry?.entityId ?? null,
            balances,
          },
        ])
      } catch (err) {
        return toolError(
          err instanceof Error ? err.message : 'Could not load balances.',
        )
      }
    },
  )

  server.registerTool(
    'get_transfers',
    {
      title: 'Get transfers',
      description:
        'Load the activity timeline for an address (token transfers, native txs, escrow events).',
      inputSchema: {
        networkId: z.string().describe('base-sepolia | polygon-amoy'),
        address: z.string().describe('0x… address'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ networkId, address }) => {
      const net = parseNetworkId(networkId)
      if (!net) {
        return toolError(
          `Invalid networkId. Use one of: ${NETWORK_IDS.join(', ')}`,
        )
      }
      if (!ADDRESS_RE.test(address)) {
        return toolError('Invalid address. Expected 0x + 40 hex chars.')
      }
      try {
        const result = await getTransfers(net, address)
        const entry = lookupAddress(net, address)
        return textJson([
          {
            label: entry?.label ?? null,
            role: entry?.role ?? null,
            ...result,
          },
        ])
      } catch (err) {
        return toolError(
          err instanceof Error ? err.message : 'Could not load transfers.',
        )
      }
    },
  )

  server.registerTool(
    'get_entity',
    {
      title: 'Get entity',
      description:
        'Cross-network wallets for a known SettlementOS entity (optional live balances).',
      inputSchema: {
        entityId: z
          .string()
          .describe(
            'ent_acme_us | ent_tokyo_supplier | ent_sg_supplier | ent_osaka_parts',
          ),
        includeBalances: z
          .boolean()
          .optional()
          .describe('When true, fetch balances for each wallet (slower)'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ entityId, includeBalances }) => {
      if (!isEntityId(entityId)) {
        return toolError(
          `Unknown entityId. Use one of: ${ENTITIES.map((e) => e.entityId).join(', ')}`,
        )
      }
      const meta = getEntity(entityId)
      const wallets = getEntityWallets(entityId).map((w) => ({
        address: w.address,
        networkId: w.networkId,
        label: w.label,
        role: w.role,
      }))
      if (!includeBalances) {
        return textJson([{ entity: meta, wallets }])
      }
      try {
        const withBalances = await Promise.all(
          wallets.map(async (w) => ({
            ...w,
            balances: await getBalances(w.networkId, w.address),
          })),
        )
        return textJson([{ entity: meta, wallets: withBalances }])
      } catch (err) {
        return toolError(
          err instanceof Error ? err.message : 'Could not load entity balances.',
        )
      }
    },
  )

  server.registerTool(
    'summarize_explorer',
    {
      title: 'Summarize explorer',
      description:
        'Aggregate address-book counts by network/role and list known entities.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => textJson([summarizeExplorer()]),
  )

  server.registerResource(
    'networks',
    'explorer://networks',
    {
      description: 'Supported networks JSON',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(
            { networks: NETWORK_IDS.map((id) => NETWORKS[id]) },
            null,
            2,
          ),
        },
      ],
    }),
  )

  server.registerResource(
    'address-book',
    'explorer://address-book',
    {
      description: 'Full bundled address book',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(
            { addresses: filterAddressBook({}) },
            null,
            2,
          ),
        },
      ],
    }),
  )

  server.registerResource(
    'address-book-network',
    new ResourceTemplate('explorer://address-book/{networkId}', {
      list: async () => ({
        resources: NETWORK_IDS.map((id) => ({
          uri: `explorer://address-book/${id}`,
          name: NETWORKS[id].name,
          description: `Address book for ${NETWORKS[id].name}`,
          mimeType: 'application/json',
        })),
      }),
    }),
    {
      description: 'Address book filtered to one network',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const networkId =
        typeof variables.networkId === 'string' ? variables.networkId : ''
      if (!isNetworkId(networkId)) {
        throw new Error('Invalid networkId.')
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                networkId,
                addresses: getAddressesForNetwork(networkId).map((e) => ({
                  address: e.address,
                  role: e.role,
                  label: e.label,
                  entityId: e.entityId ?? null,
                  token: e.token ?? null,
                })),
              },
              null,
              2,
            ),
          },
        ],
      }
    },
  )

  server.registerPrompt(
    'inspect_address',
    {
      title: 'Inspect address',
      description:
        'Load balances + recent activity for an address into a Q&A prompt.',
      argsSchema: {
        networkId: z.string().describe('base-sepolia | polygon-amoy'),
        address: z.string().describe('0x… address'),
      },
    },
    async ({ networkId, address }) => {
      const net = parseNetworkId(networkId)
      if (!net || !ADDRESS_RE.test(address)) {
        return {
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: 'Pass a valid networkId and 0x address.',
              },
            },
          ],
        }
      }
      try {
        const [balances, transfers] = await Promise.all([
          getBalances(net, address),
          getTransfers(net, address),
        ])
        const entry = lookupAddress(net, address)
        return {
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: [
                  'Answer questions about this SettlementOS explorer address using only the JSON below.',
                  'Do not invent balances, transfers, or labels.',
                  '',
                  '```json',
                  JSON.stringify(
                    toJsonSafe({
                      networkId: net,
                      address,
                      label: entry?.label ?? null,
                      role: entry?.role ?? null,
                      entityId: entry?.entityId ?? null,
                      balances,
                      activity: transfers,
                    }),
                    null,
                    2,
                  ),
                  '```',
                ].join('\n'),
              },
            },
          ],
        }
      } catch (err) {
        return {
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: `Could not load address: ${err instanceof Error ? err.message : String(err)}`,
              },
            },
          ],
        }
      }
    },
  )

  server.registerPrompt(
    'compare_entities',
    {
      title: 'Compare entities',
      description: 'Side-by-side wallets (and optional balances) for 2–4 entities.',
      argsSchema: {
        entityIds: z
          .string()
          .describe('Comma-separated entity ids (2–4)'),
        includeBalances: z
          .string()
          .optional()
          .describe('Set to "true" to fetch live balances'),
      },
    },
    async ({ entityIds, includeBalances }) => {
      const idList = String(entityIds || '')
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      if (idList.length < 2 || idList.length > 4) {
        return {
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: 'Pass between 2 and 4 comma-separated entity ids.',
              },
            },
          ],
        }
      }
      const wantBalances = includeBalances === 'true'
      const packages: unknown[] = []
      const errors: string[] = []
      for (const id of idList) {
        if (!isEntityId(id)) {
          errors.push(`${id}: unknown entity`)
          continue
        }
        const wallets = getEntityWallets(id)
        if (!wantBalances) {
          packages.push({
            entity: getEntity(id),
            wallets: wallets.map((w) => ({
              networkId: w.networkId,
              address: w.address,
              label: w.label,
            })),
          })
          continue
        }
        try {
          packages.push({
            entity: getEntity(id),
            wallets: await Promise.all(
              wallets.map(async (w) => ({
                networkId: w.networkId,
                address: w.address,
                label: w.label,
                balances: await getBalances(w.networkId, w.address),
              })),
            ),
          })
        } catch (err) {
          errors.push(
            `${id}: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      }
      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: [
                'Compare these SettlementOS entities across Base Sepolia and Polygon Amoy.',
                'Cover wallets, roles, and balance differences when present.',
                errors.length ? `Load errors:\n${errors.join('\n')}` : '',
                '',
                '```json',
                JSON.stringify(toJsonSafe(packages), null, 2),
                '```',
              ]
                .filter(Boolean)
                .join('\n'),
            },
          },
        ],
      }
    },
  )

  return server
}
