import { type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import {
  getBlockDetail,
  parseBlockId,
  type BlockLookup,
  type BlockTxRow,
  type FoundBlockLookup,
} from '../chain/block'
import { formatRelativeAge } from '../chain/transaction'
import { labelForAddress, lookupAddress } from '../config/address-book'
import {
  isNetworkId,
  NETWORKS,
  type NetworkId,
} from '../config/networks'
import { CopyButton } from '../components/CopyButton'
import { ExplorerLink } from '../components/ExplorerLink'
import { RoleBadge } from '../components/RoleBadge'
import { RpcOverrideForm } from '../components/RpcOverrideForm'
import { StatusBanner } from '../components/StatusBanner'
import { TxLink } from '../components/TxLink'
import { AmountDisplay } from '../components/ui/AmountDisplay'
import { Breadcrumbs } from '../components/ui/Breadcrumbs'
import { DetailsPanel, type DetailRow } from '../components/ui/DetailsPanel'
import { PageSplit } from '../components/ui/PageSplit'
import { ReceiptCard } from '../components/ui/ReceiptCard'
import { StatusPill } from '../components/ui/StatusPill'
import { useAsync } from '../hooks/useAsync'
import { formatNative, formatTimestamp } from '../lib/format'
import '../styles/block.css'

export function BlockPage() {
  const { networkId: rawNetwork, blockNumberOrHash: rawId = '' } = useParams()
  const networkId = rawNetwork && isNetworkId(rawNetwork) ? rawNetwork : null
  const parsed = parseBlockId(rawId)

  if (!networkId) {
    return (
      <div className="page block-page">
        <ReceiptCard tone="failed" title="Unknown network">
          <StatusBanner tone="error">Invalid network.</StatusBanner>
        </ReceiptCard>
      </div>
    )
  }

  if (!parsed) {
    return (
      <BlockFrame networkId={networkId} current="Block">
        <ReceiptCard tone="failed" title="This is not a block identifier">
          <StatusBanner tone="error">
            Invalid block. Expected a decimal block number or a 0x-prefixed
            32-byte block hash.
          </StatusBanner>
        </ReceiptCard>
      </BlockFrame>
    )
  }

  if (rawId !== parsed.canonical) {
    return (
      <Navigate
        to={`/${networkId}/block/${parsed.canonical}`}
        replace
      />
    )
  }

  return <BlockDetail networkId={networkId} id={parsed.canonical} />
}

function BlockDetail({
  networkId,
  id,
}: {
  networkId: NetworkId
  id: string
}) {
  const lookup = useAsync(`block-full:${networkId}:${id}`, () =>
    getBlockDetail(networkId, id),
  )

  return (
    <BlockFrame networkId={networkId} current={crumbLabel(id)}>
      {lookup.status === 'loading' ? (
        <p className="muted">Loading block…</p>
      ) : lookup.status === 'error' ? (
        <ReceiptCard tone="failed" title="The network did not answer">
          <StatusBanner tone="error">
            RPC unavailable: {lookup.error}
          </StatusBanner>
          <RpcOverrideForm
            networkId={networkId}
            defaultOpen
            onChanged={lookup.retry}
          />
        </ReceiptCard>
      ) : (
        <BlockBody networkId={networkId} result={lookup.data} />
      )}
    </BlockFrame>
  )
}

function crumbLabel(id: string): string {
  return /^\d+$/.test(id) ? `Block ${groupInteger(id)}` : `Block ${id.slice(0, 10)}…`
}

function BlockFrame({
  networkId,
  current,
  children,
}: {
  networkId: NetworkId
  current: string
  children: ReactNode
}) {
  return (
    <div className="page block-page">
      <Breadcrumbs
        items={[
          { label: NETWORKS[networkId].name, href: `/${networkId}` },
          { label: current },
        ]}
      />
      {children}
    </div>
  )
}

function explorerBlockUrl(networkId: NetworkId, id: string): string | null {
  const base = NETWORKS[networkId].explorerUrl
  return base ? `${base}/block/${id}` : null
}

function BlockBody({
  networkId,
  result,
}: {
  networkId: NetworkId
  result: BlockLookup
}) {
  if (result.status === 'invalid') {
    return (
      <ReceiptCard tone="failed" title="This is not a block identifier">
        <StatusBanner tone="error">
          Invalid block. Expected a decimal block number or a 0x-prefixed
          32-byte block hash.
        </StatusBanner>
      </ReceiptCard>
    )
  }

  if (result.status === 'not_found') {
    if (networkId === 'fortel2-sepolia') {
      return (
        <ReceiptCard title="No block with that identifier">
          <StatusBanner tone="warn">
            Block not found on ForteL2 Sepolia. The public replica can lag the
            sequencer by a few minutes, and the sequencer is offline 23:45–03:00
            Pacific. Retry shortly — this block will not appear on Base Sepolia
            or Polygon Amoy.
          </StatusBanner>
        </ReceiptCard>
      )
    }
    return (
      <ReceiptCard title="No block with that identifier">
        <StatusBanner tone="warn">
          Block not found on {NETWORKS[networkId].name}. This node may not have
          this block yet, or its history may be pruned.
        </StatusBanner>
      </ReceiptCard>
    )
  }

  return <FoundFields block={result} networkId={networkId} />
}

function FoundFields({
  block,
  networkId,
}: {
  block: FoundBlockLookup
  networkId: NetworkId
}) {
  const gasLimit = block.gasLimit
  const pct =
    gasLimit > 0n
      ? ((Number(block.gasUsed) * 1000) / Number(gasLimit) / 10).toFixed(1)
      : '0.0'
  const prevDisabled = block.number === 0n
  const nextDisabled = block.number >= block.head
  const prev = block.number === 0n ? 0n : block.number - 1n
  const next = block.number + 1n
  const txCount = block.transactions.length
  const txWord = txCount === 1 ? 'transaction' : 'transactions'
  const age = headlineAge(block.timestamp)
  const height = groupInteger(block.number)
  const finality = finalityFor(block)
  const explorerName = NETWORKS[networkId].explorerName

  return (
    <PageSplit
      main={
        <>
          <ReceiptCard
            status={
              finality ? (
                <StatusPill status={finality.status}>{finality.label}</StatusPill>
              ) : undefined
            }
            title={`Block ${height} · ${txCount} ${txWord} · ${age}`}
            note={finality?.note}
            action={
              <nav className="block-adjacent" aria-label="Adjacent blocks">
                {prevDisabled ? (
                  <button type="button" className="btn-ghost" disabled>
                    Previous
                  </button>
                ) : (
                  <Link
                    className="btn-ghost"
                    to={`/${networkId}/block/${prev.toString()}`}
                  >
                    Previous
                  </Link>
                )}
                {nextDisabled ? (
                  <button type="button" className="btn-ghost" disabled>
                    Next
                  </button>
                ) : (
                  <Link
                    className="btn-ghost"
                    to={`/${networkId}/block/${next.toString()}`}
                  >
                    Next
                  </Link>
                )}
                {explorerName ? (
                  <ExplorerLink href={explorerBlockUrl(networkId, block.number.toString())}>
                    View on {explorerName} ↗
                  </ExplorerLink>
                ) : null}
              </nav>
            }
          >
            <div className="amount-pair">
              <AmountDisplay label="Height" amount={height} unit="block" />
              <AmountDisplay
                label="Transactions"
                amount={String(txCount)}
                unit={txWord}
                sub={age}
              />
            </div>
          </ReceiptCard>
          <section className="block-txs" aria-label="Transactions">
            <h2>Transactions</h2>
            {txCount === 0 ? (
              <p className="muted">No transactions.</p>
            ) : (
              <TxList networkId={networkId} transactions={block.transactions} />
            )}
          </section>
        </>
      }
      side={
        <DetailsPanel
          rows={detailRows({
            block,
            networkId,
            prev,
            prevDisabled,
            pct,
          })}
        />
      }
    />
  )
}

function detailRows({
  block,
  networkId,
  prev,
  prevDisabled,
  pct,
}: {
  block: FoundBlockLookup
  networkId: NetworkId
  prev: bigint
  prevDisabled: boolean
  pct: string
}): DetailRow[] {
  return [
    { id: 'number', label: 'Number', value: block.number.toString() },
    {
      id: 'hash',
      label: 'Hash',
      value: (
        <>
          <span className="mono break">{block.hash}</span>{' '}
          <CopyButton text={block.hash} />
        </>
      ),
    },
    {
      id: 'parent',
      label: 'Parent hash',
      value: prevDisabled ? (
        <span className="mono break">{block.parentHash}</span>
      ) : (
        <Link
          className="mono break"
          to={`/${networkId}/block/${prev.toString()}`}
        >
          {block.parentHash}
        </Link>
      ),
    },
    {
      id: 'timestamp',
      label: 'Timestamp',
      value: (
        <>
          {formatTimestamp(block.timestamp)}{' '}
          <span className="muted">({formatRelativeAge(block.timestamp)})</span>
        </>
      ),
    },
    {
      id: 'transactions',
      label: 'Transactions',
      value: String(block.transactions.length),
    },
    {
      id: 'gas',
      label: 'Gas used / limit',
      value: `${block.gasUsed.toString()} / ${block.gasLimit.toString()} (${pct}%)`,
    },
    {
      id: 'base-fee',
      label: 'Base fee',
      value:
        block.baseFeePerGas != null
          ? `${block.baseFeePerGas.toString()} wei`
          : '—',
    },
    {
      id: 'miner',
      label: 'Fee recipient',
      value: <AddressValue networkId={networkId} address={block.miner} />,
    },
  ]
}

function TxList({
  networkId,
  transactions,
}: {
  networkId: NetworkId
  transactions: BlockTxRow[]
}) {
  return (
    <ol className="block-tx-list">
      {transactions.map((tx) => (
        <li className="block-tx" key={tx.hash}>
          <div className="block-tx-hash">
            <TxLink networkId={networkId} hash={tx.hash} className="mono break">
              {tx.hash}
            </TxLink>
          </div>
          <dl className="block-tx-fields">
            <div>
              <dt>From</dt>
              <dd>
                <AddressValue networkId={networkId} address={tx.from} />
              </dd>
            </div>
            <div>
              <dt>To</dt>
              <dd>
                {tx.to ? (
                  <AddressValue networkId={networkId} address={tx.to} />
                ) : (
                  <span>Contract creation</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Value</dt>
              <dd>
                {formatNative(tx.value)} {NETWORKS[networkId].nativeSymbol}
              </dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{tx.type ?? '—'}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ol>
  )
}

function AddressValue({
  networkId,
  address,
}: {
  networkId: NetworkId
  address: string | null
}) {
  if (!address) return <span>Contract creation</span>
  const entry = lookupAddress(networkId, address)
  return (
    <div>
      <Link to={`/${networkId}/address/${address}`}>
        {labelForAddress(networkId, address)}
      </Link>{' '}
      {entry ? (
        <RoleBadge role={entry.role} />
      ) : (
        <span className="role-badge role-external">External</span>
      )}
      <div className="mono muted small break">{address}</div>
    </div>
  )
}

function groupInteger(value: bigint | number | string): string {
  const raw = value.toString()
  const negative = raw.startsWith('-')
  const digits = negative ? raw.slice(1) : raw
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return negative ? `-${grouped}` : grouped
}

function headlineAge(unixSeconds: number): string {
  const age = formatRelativeAge(unixSeconds)
  if (age === '1d ago') return '1 day ago'
  return age
    .replace(/^(\d+)s ago$/, '$1 sec ago')
    .replace(/^(\d+)m ago$/, '$1 min ago')
    .replace(/^(\d+)h ago$/, '$1 hr ago')
    .replace(/^(\d+)d ago$/, '$1 days ago')
}

function finalityFor(block: FoundBlockLookup): {
  status: 'success' | 'pending'
  label: string
  note: string
} | null {
  if (block.number > block.head) return null
  const confirmations = block.head - block.number + 1n
  if (block.number === block.head) {
    return {
      status: 'pending',
      label: 'Head',
      note: 'Latest block on this network. Finality is not known yet.',
    }
  }
  const word = confirmations === 1n ? 'confirmation' : 'confirmations'
  return {
    status: 'success',
    label: 'Final',
    note: `${confirmations.toString()} ${word}`,
  }
}
