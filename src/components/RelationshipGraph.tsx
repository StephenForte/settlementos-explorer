import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Link } from 'react-router-dom'
import { getBalances, type AddressBalances } from '../chain/balances'
import {
  aggregateFlows,
  getTransfers,
  onlyTransfers,
  type TransferEvent,
} from '../chain/transfers'
import {
  getAddressesForNetwork,
  lookupAddress,
  truncateAddress,
  type AddressEntry,
  type AddressRole,
} from '../config/address-book'
import type { NetworkId } from '../config/networks'
import { BalanceChips } from './BalanceChips'
import { RoleBadge } from './RoleBadge'
import { StatusBanner } from './StatusBanner'
import { TransferTable } from './TransferTable'
import { useAsync } from '../hooks/useAsync'

const ROLE_POSITION: Record<AddressRole, { x: number; yBase: number }> = {
  entity: { x: 40, yBase: 40 },
  operator: { x: 320, yBase: 40 },
  'escrow-contract': { x: 560, yBase: 180 },
  treasury: { x: 820, yBase: 180 },
  'token-contract': { x: 320, yBase: 420 },
}

type GraphNodeData = {
  label: string
  role: AddressRole | 'external'
  address: string
}

function GraphAddressNode({ data }: NodeProps<Node<GraphNodeData>>) {
  return (
    <div className={`graph-node-inner role-${data.role}`}>
      <Handle type="target" position={Position.Left} />
      <strong>{data.label}</strong>
      <span className="mono small">{truncateAddress(data.address)}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

const nodeTypes = { address: GraphAddressNode }

function layoutNodes(entries: AddressEntry[]): Node<GraphNodeData>[] {
  const counters: Partial<Record<AddressRole, number>> = {}
  return entries.map((entry) => {
    const slot = counters[entry.role] ?? 0
    counters[entry.role] = slot + 1
    const pos = ROLE_POSITION[entry.role]
    return {
      id: entry.address.toLowerCase(),
      type: 'address',
      position: { x: pos.x, y: pos.yBase + slot * 90 },
      data: {
        label: entry.label,
        role: entry.role,
        address: entry.address,
      },
      className: `graph-node role-${entry.role}`,
      style: { width: 170 } satisfies CSSProperties,
    }
  })
}

function buildEdges(
  flows: ReturnType<typeof aggregateFlows>,
  known: Set<string>,
): { edges: Edge[]; externals: Node<GraphNodeData>[] } {
  const externals: Node<GraphNodeData>[] = []
  const seenExternal = new Set<string>()
  const edges: Edge[] = []

  const maxVol = flows.reduce(
    (m, f) => (f.totalRaw > m ? f.totalRaw : m),
    1n,
  )

  for (const flow of flows) {
    const fromId = flow.from.toLowerCase()
    const toId = flow.to.toLowerCase()

    for (const [id, label, address] of [
      [fromId, flow.fromLabel, flow.from],
      [toId, flow.toLabel, flow.to],
    ] as const) {
      if (!known.has(id) && !seenExternal.has(id)) {
        seenExternal.add(id)
        externals.push({
          id,
          type: 'address',
          position: {
            x: 40 + externals.length * 30,
            y: 560 + (externals.length % 3) * 70,
          },
          data: { label, role: 'external', address },
          className: 'graph-node role-external',
          style: { width: 160 },
        })
      }
    }

    const thickness = Math.max(
      1,
      Math.min(8, Number((flow.totalRaw * 8n) / maxVol) || 1),
    )
    edges.push({
      id: `${fromId}-${toId}-${flow.tokenSymbol}`,
      source: fromId,
      target: toId,
      label: `${flow.totalFormatted} ${flow.tokenSymbol}`,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      style: { strokeWidth: thickness, stroke: 'var(--edge)' },
      labelStyle: { fontSize: 10, fill: 'var(--ink-muted)' },
      animated: false,
    })
  }

  return { edges, externals }
}

export function RelationshipGraph({ networkId }: { networkId: NetworkId }) {
  const entries = useMemo(() => getAddressesForNetwork(networkId), [networkId])
  const knownIds = useMemo(
    () => new Set(entries.map((e) => e.address.toLowerCase())),
    [entries],
  )

  const history = useAsync(`graph-transfers:${networkId}`, async () => {
    const results = await Promise.all(
      entries
        .filter((e) => e.role !== 'token-contract')
        .map(async (e) => {
          const res = await getTransfers(networkId, e.address)
          return onlyTransfers(res.items)
        }),
    )
    const seen = new Set<string>()
    const merged: TransferEvent[] = []
    for (const list of results) {
      for (const t of list) {
        const key = `${t.txHash}-${t.from}-${t.to}-${t.token.address}`
        if (seen.has(key)) continue
        seen.add(key)
        merged.push(t)
      }
    }
    return merged
  })

  const [selected, setSelected] = useState<string | null>(null)

  const { nodes, edges, edgesUnavailable } = useMemo(() => {
    const baseNodes = layoutNodes(entries)
    if (history.status !== 'ok') {
      return {
        nodes: baseNodes,
        edges: [] as Edge[],
        edgesUnavailable: history.status === 'error',
      }
    }
    const flows = aggregateFlows(history.data)
    const built = buildEdges(flows, knownIds)
    return {
      nodes: [...baseNodes, ...built.externals],
      edges: built.edges,
      edgesUnavailable: false,
    }
  }, [entries, history, knownIds])

  const onNodeClick: NodeMouseHandler = (_evt, node) => {
    setSelected(String(node.data.address ?? node.id))
  }

  return (
    <div className="graph-layout">
      <div className="graph-canvas">
        {history.status === 'loading' ? (
          <StatusBanner>Loading transfer edges…</StatusBanner>
        ) : null}
        {history.status === 'error' || edgesUnavailable ? (
          <StatusBanner
            tone="warn"
            action={
              <button type="button" className="btn-ghost" onClick={history.retry}>
                Retry
              </button>
            }
          >
            Nodes shown; edges unavailable ({history.status === 'error' ? history.error : 'history fetch failed'}).
          </StatusBanner>
        ) : null}
        <div className="reactflow-host">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.3}
            maxZoom={1.8}
            onNodeClick={onNodeClick}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={18} size={1} color="var(--grid-dot)" />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>
      </div>
      <aside className="graph-side">
        {selected ? (
          <NodePanel
            networkId={networkId}
            address={selected}
            onClose={() => setSelected(null)}
          />
        ) : (
          <div className="panel empty-panel">
            <h2>Relationship graph</h2>
            <p className="muted">
              Click a node to inspect balances and recent transfers. Edges show
              aggregated token volume between addresses.
            </p>
          </div>
        )}
      </aside>
    </div>
  )
}

function NodePanel({
  networkId,
  address,
  onClose,
}: {
  networkId: NetworkId
  address: string
  onClose: () => void
}) {
  const entry = lookupAddress(networkId, address)
  const balances = useAsync(`bal:${networkId}:${address}`, () =>
    getBalances(networkId, address),
  )
  const transfers = useAsync(`xfers:${networkId}:${address}`, () =>
    getTransfers(networkId, address),
  )
  const [bal, setBal] = useState<AddressBalances | null>(null)

  useEffect(() => {
    if (balances.status === 'ok') setBal(balances.data)
  }, [balances])

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>{entry?.label ?? truncateAddress(address)}</h2>
          {entry ? <RoleBadge role={entry.role} /> : (
            <span className="role-badge role-external">External</span>
          )}
        </div>
        <button type="button" className="btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="mono small break">{address}</p>
      <BalanceChips balances={bal ?? undefined} />
      {transfers.status === 'ok' ? (
        <TransferTable
          items={transfers.data.items.slice(0, 8)}
          self={address}
          networkId={networkId}
        />
      ) : transfers.status === 'loading' ? (
        <p className="muted">Loading transfers…</p>
      ) : (
        <StatusBanner tone="warn">{transfers.error}</StatusBanner>
      )}
      <Link className="btn-primary" to={`/${networkId}/address/${address}`}>
        Full detail
      </Link>
    </div>
  )
}
