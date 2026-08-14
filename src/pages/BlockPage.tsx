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
import { useAsync } from '../hooks/useAsync'
import { formatNative, formatTimestamp } from '../lib/format'

export function BlockPage() {
  const { networkId: rawNetwork, blockNumberOrHash: rawId = '' } = useParams()
  const networkId = rawNetwork && isNetworkId(rawNetwork) ? rawNetwork : null
  const parsed = parseBlockId(rawId)

  if (!networkId) {
    return (
      <div className="page">
        <StatusBanner tone="error">Invalid network.</StatusBanner>
      </div>
    )
  }

  if (!parsed) {
    return (
      <div className="page">
        <StatusBanner tone="error">
          Invalid block. Expected a decimal block number or a 0x-prefixed
          32-byte block hash.
        </StatusBanner>
      </div>
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
    <div className="page">
      <BlockHeader networkId={networkId} id={id} />
      {lookup.status === 'loading' ? (
        <p className="muted">Loading block…</p>
      ) : lookup.status === 'error' ? (
        <>
          <StatusBanner tone="error">
            RPC unavailable: {lookup.error}
          </StatusBanner>
          <RpcOverrideForm
            networkId={networkId}
            defaultOpen
            onChanged={lookup.retry}
          />
        </>
      ) : (
        <BlockBody networkId={networkId} result={lookup.data} />
      )}
    </div>
  )
}

function explorerBlockUrl(networkId: NetworkId, id: string): string | null {
  const base = NETWORKS[networkId].explorerUrl
  return base ? `${base}/block/${id}` : null
}

function BlockHeader({
  networkId,
  id,
}: {
  networkId: NetworkId
  id: string
}) {
  const explorerName = NETWORKS[networkId].explorerName
  return (
    <section className="detail-header">
      <p className="eyebrow">{NETWORKS[networkId].name}</p>
      <h1>Block</h1>
      <div className="address-row-meta">
        <span className="mono break">{id}</span>
        <CopyButton text={id} />
        {explorerName ? (
          <ExplorerLink href={explorerBlockUrl(networkId, id)}>
            View on {explorerName} ↗
          </ExplorerLink>
        ) : null}
      </div>
    </section>
  )
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
      <StatusBanner tone="error">
        Invalid block. Expected a decimal block number or a 0x-prefixed 32-byte
        block hash.
      </StatusBanner>
    )
  }

  if (result.status === 'not_found') {
    return (
      <StatusBanner tone="warn">
        Block not found on {NETWORKS[networkId].name}. This node may not have
        this block yet, or its history may be pruned.
      </StatusBanner>
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

  return (
    <>
      <section className="section">
        <div className="section-head">
          <h2>Overview</h2>
          <nav aria-label="Adjacent blocks">
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
            )}{' '}
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
          </nav>
        </div>
        <FieldTable>
          <Field label="Number">{block.number.toString()}</Field>
          <Field label="Hash">
            <span className="mono break">{block.hash}</span>
          </Field>
          <Field label="Parent hash">
            {prevDisabled ? (
              <span className="mono break">{block.parentHash}</span>
            ) : (
              <Link
                className="mono break"
                to={`/${networkId}/block/${prev.toString()}`}
              >
                {block.parentHash}
              </Link>
            )}
          </Field>
          <Field label="Timestamp">
            {formatTimestamp(block.timestamp)}{' '}
            <span className="muted">({formatRelativeAge(block.timestamp)})</span>
          </Field>
          <Field label="Transactions">{block.transactions.length}</Field>
          <Field label="Gas used / limit">
            {block.gasUsed.toString()} / {gasLimit.toString()} ({pct}%)
          </Field>
          <Field label="Base fee">
            {block.baseFeePerGas != null
              ? `${block.baseFeePerGas.toString()} wei`
              : '—'}
          </Field>
          <Field label="Fee recipient">
            <AddressValue networkId={networkId} address={block.miner} />
          </Field>
        </FieldTable>
      </section>

      <section className="section">
        <h2>Transactions</h2>
        {block.transactions.length === 0 ? (
          <p className="muted">No transactions.</p>
        ) : (
          <TxTable networkId={networkId} transactions={block.transactions} />
        )}
      </section>
    </>
  )
}

function TxTable({
  networkId,
  transactions,
}: {
  networkId: NetworkId
  transactions: BlockTxRow[]
}) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Hash</th>
            <th>From</th>
            <th>To</th>
            <th>Value</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr key={tx.hash}>
              <td>
                <TxLink networkId={networkId} hash={tx.hash} className="mono break">
                  {tx.hash}
                </TxLink>
              </td>
              <td>
                <AddressValue networkId={networkId} address={tx.from} />
              </td>
              <td>
                {tx.to ? (
                  <AddressValue networkId={networkId} address={tx.to} />
                ) : (
                  <span>Contract creation</span>
                )}
              </td>
              <td>
                {formatNative(tx.value)} {NETWORKS[networkId].nativeSymbol}
              </td>
              <td>{tx.type ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FieldTable({ children }: { children: ReactNode }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{children}</td>
    </tr>
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
