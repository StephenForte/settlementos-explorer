import { useState, type ReactNode } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import {
  formatGwei,
  formatRelativeAge,
  getTransactionDetail,
  parseTxHash,
  summarizeInput,
  type DecodedTxLog,
  type MinedTxLookup,
  type PendingTxLookup,
  type TxLookup,
} from '../chain/transaction'
import { labelForAddress, lookupAddress } from '../config/address-book'
import {
  explorerTxUrl,
  isNetworkId,
  NETWORK_IDS,
  NETWORKS,
  type NetworkId,
} from '../config/networks'
import { CopyButton } from '../components/CopyButton'
import { ExplorerLink } from '../components/ExplorerLink'
import { RoleBadge } from '../components/RoleBadge'
import { RpcOverrideForm } from '../components/RpcOverrideForm'
import { StatusBanner } from '../components/StatusBanner'
import { useAsync } from '../hooks/useAsync'
import { formatNative, formatTimestamp } from '../lib/format'

/** D33: a bare `/tx/<hash>` is a ForteL2 link — Base and Amoy have public explorers. */
const BARE_TX_DEFAULT_NETWORK: NetworkId = 'fortel2-sepolia'

function resolveTxAliasNetwork(search: URLSearchParams): NetworkId {
  const network = search.get('network')
  if (network && isNetworkId(network)) return network
  const chainIdRaw = search.get('chainId')
  if (chainIdRaw != null && chainIdRaw !== '') {
    const chainId = Number(chainIdRaw)
    if (Number.isInteger(chainId)) {
      const match = NETWORK_IDS.find((id) => NETWORKS[id].chainId === chainId)
      if (match) return match
    }
  }
  return BARE_TX_DEFAULT_NETWORK
}

/** Basescan-shaped aliases → canonical `/{networkId}/tx/{hash}`. */
export function TransactionAliasPage() {
  const { txHash = '' } = useParams()
  const [params] = useSearchParams()
  const networkId = resolveTxAliasNetwork(params)
  const parsed = parseTxHash(txHash)
  const hash = parsed ?? txHash.toLowerCase()
  return <Navigate to={`/${networkId}/tx/${hash}`} replace />
}

export function TransactionPage() {
  const { networkId: rawNetwork, txHash: rawHash = '' } = useParams()
  const networkId = rawNetwork && isNetworkId(rawNetwork) ? rawNetwork : null
  const parsed = parseTxHash(rawHash)

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
          Invalid transaction hash. Expected a 0x-prefixed 32-byte hex string.
        </StatusBanner>
      </div>
    )
  }

  if (rawHash !== parsed) {
    return <Navigate to={`/${networkId}/tx/${parsed}`} replace />
  }

  return <TransactionDetail networkId={networkId} hash={parsed} />
}

function TransactionDetail({
  networkId,
  hash,
}: {
  networkId: NetworkId
  hash: `0x${string}`
}) {
  const lookup = useAsync(`tx:${networkId}:${hash}`, () =>
    getTransactionDetail(networkId, hash),
  )

  return (
    <div className="page">
      <TxHeader networkId={networkId} hash={hash} />
      {lookup.status === 'loading' ? (
        <p className="muted">Loading transaction…</p>
      ) : lookup.status === 'error' ? (
        <>
          <StatusBanner tone="error">RPC unavailable: {lookup.error}</StatusBanner>
          <RpcOverrideForm
            networkId={networkId}
            defaultOpen
            onChanged={lookup.retry}
          />
        </>
      ) : (
        <TxBody networkId={networkId} hash={hash} result={lookup.data} />
      )}
    </div>
  )
}

function TxHeader({ networkId, hash }: { networkId: NetworkId; hash: string }) {
  const explorerName = NETWORKS[networkId].explorerName
  return (
    <section className="detail-header">
      <p className="eyebrow">{NETWORKS[networkId].name}</p>
      <h1>Transaction</h1>
      <div className="address-row-meta">
        <span className="mono break">{hash}</span>
        <CopyButton text={hash} />
        {explorerName ? (
          <ExplorerLink href={explorerTxUrl(networkId, hash)}>
            View on {explorerName} ↗
          </ExplorerLink>
        ) : null}
      </div>
    </section>
  )
}

function TxBody({
  networkId,
  hash,
  result,
}: {
  networkId: NetworkId
  hash: string
  result: TxLookup
}) {
  if (result.status === 'invalid') {
    return (
      <StatusBanner tone="error">
        Invalid transaction hash. Expected a 0x-prefixed 32-byte hex string.
      </StatusBanner>
    )
  }

  if (result.status === 'not_found') {
    const others = NETWORK_IDS.filter((id) => id !== networkId)
    return (
      <StatusBanner tone="warn">
        Transaction not found on {NETWORKS[networkId].name}. It may be pending, on
        another corridor, or beyond this node&apos;s history.{' '}
        {others.map((id, i) => (
          <span key={id}>
            {i > 0 ? ' · ' : null}
            <Link to={`/${id}/tx/${hash}`}>Try {NETWORKS[id].name}</Link>
          </span>
        ))}
      </StatusBanner>
    )
  }

  if (result.status === 'pending') {
    return (
      <>
        <StatusBanner tone="info">
          Pending — this transaction is not yet included in a block.
        </StatusBanner>
        <PendingFields tx={result} networkId={networkId} />
      </>
    )
  }

  return <MinedFields tx={result} networkId={networkId} />
}

function PendingFields({
  tx,
  networkId,
}: {
  tx: PendingTxLookup
  networkId: NetworkId
}) {
  return (
    <section className="section">
      <h2>Overview</h2>
      <FieldTable>
        <Field label="From">
          <AddressValue networkId={networkId} address={tx.from} />
        </Field>
        <Field label="To">
          <AddressValue networkId={networkId} address={tx.to} />
        </Field>
        <Field label="Value">
          {formatNative(tx.value)} {NETWORKS[networkId].nativeSymbol}
        </Field>
        <Field label="Nonce">{tx.nonce}</Field>
        <Field label="Type">{tx.type}</Field>
        <Field label="Input">
          <InputValue input={tx.input} />
        </Field>
      </FieldTable>
    </section>
  )
}

function MinedFields({
  tx,
  networkId,
}: {
  tx: MinedTxLookup
  networkId: NetworkId
}) {
  const gasLimit = tx.gas
  const pct =
    gasLimit > 0n
      ? ((Number(tx.gasUsed) * 1000) / Number(gasLimit) / 10).toFixed(1)
      : '0.0'
  return (
    <>
      <section className="section">
        <h2>Overview</h2>
        <FieldTable>
          <Field label="Status">
            {tx.receiptStatus === 'success' ? 'Success' : 'Failed'}
          </Field>
          <Field label="Block">
            <Link to={`/${networkId}/block/${tx.blockNumber.toString()}`}>
              {tx.blockNumber.toString()}
            </Link>
          </Field>
          <Field label="Confirmations">{tx.confirmations}</Field>
          <Field label="Timestamp">
            {formatTimestamp(tx.timestamp)}{' '}
            <span className="muted">({formatRelativeAge(tx.timestamp)})</span>
          </Field>
          <Field label="From">
            <AddressValue networkId={networkId} address={tx.from} />
          </Field>
          <Field label="To">
            {tx.to ? (
              <AddressValue networkId={networkId} address={tx.to} />
            ) : (
              <>
                Contract creation
                {tx.contractAddress ? (
                  <AddressValue
                    networkId={networkId}
                    address={tx.contractAddress}
                  />
                ) : null}
              </>
            )}
          </Field>
          <Field label="Value">
            {formatNative(tx.value)} {NETWORKS[networkId].nativeSymbol}
          </Field>
          <Field label="L2 execution fee">
            {tx.l2ExecutionFeeWei != null
              ? `${formatGwei(tx.l2ExecutionFeeWei)} gwei`
              : '—'}
          </Field>
          <Field label="Gas used / limit">
            {tx.gasUsed.toString()} / {gasLimit.toString()} ({pct}%)
          </Field>
          <Field label="Gas price">
            {tx.effectiveGasPrice != null
              ? `${formatGwei(tx.effectiveGasPrice)} gwei`
              : '—'}
          </Field>
          <Field label="Nonce · Index · Type">
            {tx.nonce} · {tx.transactionIndex ?? '—'} · {tx.type}
          </Field>
          <Field label="Input">
            <InputValue input={tx.input} />
          </Field>
        </FieldTable>
      </section>

      <section className="section">
        <h2>Events</h2>
        {tx.logs.length === 0 ? (
          <p className="muted">No logs.</p>
        ) : (
          <LogTable networkId={networkId} logs={tx.logs} />
        )}
      </section>
    </>
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

function InputValue({ input }: { input: string }) {
  const [open, setOpen] = useState(false)
  const summary = summarizeInput(input)
  if (summary.kind === 'none') {
    return <span>None (plain transfer)</span>
  }
  return (
    <div>
      <span className="mono">
        {summary.selector} · {summary.byteLength} bytes
      </span>{' '}
      <button
        type="button"
        className="btn-ghost"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide input' : 'Show input'}
      </button>
      {open ? (
        <div className="address-row-meta">
          <span className="mono break">{input}</span>
          <CopyButton text={input} />
        </div>
      ) : null}
    </div>
  )
}

function LogTable({
  networkId,
  logs,
}: {
  networkId: NetworkId
  logs: DecodedTxLog[]
}) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Detail</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log, i) => (
            <LogRow key={`${log.address}-${i}`} networkId={networkId} log={log} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LogRow({
  networkId,
  log,
}: {
  networkId: NetworkId
  log: DecodedTxLog
}) {
  if (log.kind === 'erc20-transfer') {
    return (
      <tr>
        <td>
          <span className="dir in">Transfer</span>
          {log.token ? (
            <div className="muted small">{log.token.symbol}</div>
          ) : (
            <div className="mono muted small break">{log.address}</div>
          )}
        </td>
        <td>
          <Link to={`/${networkId}/address/${log.from}`}>{log.fromLabel}</Link>
          {' → '}
          <Link to={`/${networkId}/address/${log.to}`}>{log.toLabel}</Link>
        </td>
        <td>
          {log.amountFormatted != null
            ? `${log.amountFormatted}${log.token ? ` ${log.token.symbol}` : ''}`
            : log.amountRaw.toString()}
        </td>
      </tr>
    )
  }

  if (log.kind === 'escrow') {
    return (
      <tr>
        <td>
          <span className="dir escrow">{log.eventName}</span>
        </td>
        <td>
          {log.fromLabel && log.toLabel ? (
            <div>
              {log.from ? (
                <Link to={`/${networkId}/address/${log.from}`}>{log.fromLabel}</Link>
              ) : (
                log.fromLabel
              )}
              {' → '}
              {log.to ? (
                <Link to={`/${networkId}/address/${log.to}`}>{log.toLabel}</Link>
              ) : (
                log.toLabel
              )}
            </div>
          ) : null}
          {log.detail ? <div className="muted small">{log.detail}</div> : null}
          <div className="mono muted small break">{log.paymentId}</div>
        </td>
        <td>
          {log.amountFormatted
            ? `${log.amountFormatted}${log.token ? ` ${log.token.symbol}` : ''}`
            : '—'}
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td>
        <span className="dir out">Not decoded</span>
        <div className="mono muted small break">{log.address}</div>
      </td>
      <td>
        <div className="mono small break">{log.topic0}</div>
        <div className="mono muted small break">{log.data}</div>
      </td>
      <td>—</td>
    </tr>
  )
}
