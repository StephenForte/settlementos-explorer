import { useState } from 'react'
import { formatUnits } from 'viem'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import {
  formatGwei,
  formatRelativeAge,
  getTransactionDetail,
  parseTxHash,
  summarizeInput,
  type DecodedTxLog,
  type Erc20TransferLog,
  type MinedTxLookup,
  type PendingTxLookup,
  type TxLookup,
} from '../chain/transaction'
import { getEscrowAddress, labelForAddress, lookupAddress } from '../config/address-book'
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

import {
  AmountDisplay, Breadcrumbs, DetailsPanel, LedgerList, PageSplit, ReceiptCard, StatusPill,
  type DetailRow, type LedgerEntry,
} from '../components/ui'
import '../styles/transaction.css'

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
    <div className="page tx-page">
      <Breadcrumbs items={[{ label: NETWORKS[networkId].name, href: `/${networkId}` }, { label: 'Transaction' }]} />
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
  return (
    <header className="detail-header">
      <p className="eyebrow">{NETWORKS[networkId].name}</p>
      <h1>Transaction</h1>
      <span className="mono muted small break">{hash}</span>
    </header>
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
    if (networkId === 'fortel2-sepolia') {
      return (
        <StatusBanner tone="warn">
          Transaction not found on ForteL2 Sepolia. If you just settled, wait a
          few seconds and refresh — the public replica can lag the sequencer by
          a few minutes, and the sequencer itself is offline 23:45–03:00
          Pacific. SettlementOS payment links are ForteL2-only; this hash will
          not appear on Base Sepolia or Polygon Amoy.
        </StatusBanner>
      )
    }
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
    return <PageSplit main={
      <ReceiptCard status={<StatusPill status="pending">Pending</StatusPill>}
        title="Awaiting inclusion in a block" action={<CopyLink />}/>
    } side={<TechnicalDetails tx={result} />} />
  }

  return <MinedReceipt tx={result} />
}

function CopyLink() {
  return <CopyButton text={window.location.href} label="Copy link" />
}

function titleFor(tx: MinedTxLookup, transfers: Erc20TransferLog[]) {
  if (tx.receiptStatus === 'reverted') return 'Transaction reverted'
  const escrowAddress = getEscrowAddress(tx.networkId)?.toLowerCase()
  const escrow = tx.logs.find(
    (log) =>
      log.kind === 'escrow' && log.address.toLowerCase() === escrowAddress,
  )
  if (escrow?.kind === 'escrow') {
    switch (escrow.eventName) {
      case 'PaymentInitiated':
        return `${escrow.fromLabel ?? 'Sender'} initiated a payment · ${escrow.detail}`
      case 'PaymentSettled':
        return `Payment ${escrow.detail}`
      case 'PaymentRefunded':
        return `Payment refunded to ${escrow.toLabel}`
    }
  }
  const sender = labelForAddress(tx.networkId, tx.from)
  if (!tx.to) return `${sender} created a contract`
  const recipient = labelForAddress(tx.networkId, tx.to)
  if (transfers.length === 1)
    return `${transfers[0].fromLabel} sent tokens to ${transfers[0].toLabel}`
  if (transfers.length > 1)
    return `${sender} submitted ${transfers.length} token transfers`
  if (tx.input !== '0x' && tx.from.toLowerCase() === tx.to.toLowerCase())
    return `${sender} submitted a transaction to itself`
  if (tx.input !== '0x') return `${sender} called ${recipient}`
  return `${sender} sent ${NETWORKS[tx.networkId].nativeSymbol} to ${recipient}`
}

function tokenFigure(log: Erc20TransferLog, value: bigint) {
  return log.token ? formatUnits(value, log.token.decimals) : value.toString()
}

function MinedReceipt({ tx }: { tx: MinedTxLookup }) {
  const failed = tx.receiptStatus === 'reverted'
  const transfers = failed
    ? []
    : tx.logs.filter((log) => log.kind === 'erc20-transfer')
  const symbol = NETWORKS[tx.networkId].nativeSymbol
  const value = failed ? 0n : tx.value
  const fee =
    tx.l2ExecutionFeeWei == null
      ? null
      : tx.l2ExecutionFeeWei + (tx.l1DataFeeWei ?? 0n)
  const figures = transfers.map((log) => ({
    amount: tokenFigure(log, log.amountRaw),
    unit: log.token?.symbol ?? log.address,
    from: log.fromLabel,
    to: log.toLabel,
  }))
  if (value || !figures.length)
    figures.unshift({
      amount: formatUnits(value, 18),
      unit: symbol,
      from: labelForAddress(tx.networkId, tx.from),
      to: tx.to ? labelForAddress(tx.networkId, tx.to) : 'New contract',
    })
  return (
    <PageSplit
      main={
        <>
          <ReceiptCard
            tone={failed ? 'failed' : 'default'}
            title={titleFor(tx, transfers)}
            status={
              <StatusPill status={failed ? 'failed' : 'success'}>
                {failed ? 'Failed' : 'Success'}
              </StatusPill>
            }
            note={`Included in block ${tx.blockNumber} · ${tx.confirmations.toLocaleString()} confirmations`}
            action={<CopyLink />}
          >
            {failed && (
              <p>
                The transaction reverted. No assets moved. Network fees were
                still paid.
              </p>
            )}
            {figures.map((figure, index) => (
              <div className="amount-pair" key={index}>
                <AmountDisplay
                  label="Sent"
                  amount={figure.amount}
                  unit={figure.unit}
                  sub={`From ${figure.from}`}
                />
                <AmountDisplay
                  label="Received"
                  amount={figure.amount}
                  unit={figure.unit}
                  sub={`To ${figure.to}`}
                />
              </div>
            ))}
            <div className="tx-cost">
              Total fee{' '}
              <strong>
                {fee == null
                  ? 'Unavailable'
                  : `${formatUnits(fee, 18)} ${symbol}`}
              </strong>
            </div>
          </ReceiptCard>
          <NativeLedger tx={tx} value={value} />
          <TokenMovements transfers={transfers} sender={tx.from} />
        </>
      }
      side={<TechnicalDetails tx={tx} />}
    />
  )
}

function UncheckedRows({
  entries,
  totalLabel,
  total,
}: {
  entries: LedgerEntry[]
  totalLabel: string
  total: string
}) {
  return (
    <>
      {entries.map((row) => (
        <div className="ledger-row" key={row.id}>
          <div className="ledger-label">
            {row.label}
            <span className="ledger-sub">{row.sub}</span>
          </div>
          <p className="ledger-amount">{row.amount}</p>
        </div>
      ))}
      <div className="ledger-row ledger-total">
        <div>{totalLabel}</div>
        <p className="ledger-amount">{total}</p>
      </div>
    </>
  )
}

function NativeLedger({ tx, value }: { tx: MinedTxLookup; value: bigint }) {
  const format = (wei: bigint) =>
    `${formatUnits(wei, 18)} ${NETWORKS[tx.networkId].nativeSymbol}`
  const entry = (label: string, debit: bigint): LedgerEntry => ({
    id: label,
    label,
    value: -debit,
    amount: format(-debit),
  })
  const entries = [entry('Value sent', value)]
  if (tx.l2ExecutionFeeWei != null)
    entries.push(entry('L2 execution fee', tx.l2ExecutionFeeWei))
  if (tx.l1DataFeeWei != null)
    entries.push(entry('L1 data fee', tx.l1DataFeeWei))
  const total = entries.reduce((sum, row) => sum + row.value, 0n)
  const expected = tx.senderBalanceChangeWei
  const complete = tx.l2ExecutionFeeWei != null
  return (
    <section className="receipt-card">
      {expected != null && complete ? (
        <>
          <LedgerList
            entries={entries}
            expectedTotal={expected}
            formatTotal={format}
            totalLabel="Sender total"
          />
          {expected === total && (
            <p className="muted small">
              Matches the sender’s balance change across this block.
            </p>
          )}
        </>
      ) : (
        <div className="ledger">
          <h3 className="ledger-caption">Where the money went</h3>
          {!complete && <p>L2 execution fee unavailable.</p>}
          <UncheckedRows
            entries={entries}
            totalLabel={complete ? 'Sender total' : 'Known subtotal'}
            total={format(total)}
          />
          <p className="muted small">
            Not checked against balance. An isolated sender balance change could
            not be verified.
          </p>
        </div>
      )}
    </section>
  )
}

function TokenMovements({
  transfers,
  sender,
}: {
  transfers: Erc20TransferLog[]
  sender: string
}) {
  const groups = new Map<
    string,
    { token: Erc20TransferLog; entries: LedgerEntry[] }
  >()
  const account = sender.toLowerCase()
  for (const log of transfers) {
    const sent = log.from.toLowerCase() === account
    const received = log.to.toLowerCase() === account
    if (!sent && !received) continue
    const address = log.address.toLowerCase()
    const group = groups.get(address) ?? { token: log, entries: [] }
    const rows = group.entries
    const value = (received ? log.amountRaw : 0n) - (sent ? log.amountRaw : 0n)
    rows.push({
      id: String(rows.length),
      label: `${log.fromLabel} → ${log.toLabel}`,
      sub:
        sent && received
          ? `Self-transfer · ${tokenFigure(log, log.amountRaw)}`
          : undefined,
      value,
      amount: tokenFigure(log, value),
    })
    groups.set(address, group)
  }
  if (!groups.size) return null
  return (
    <section className="receipt-card">
      <h2 className="receipt-title">Sender token movements</h2>
      {Array.from(groups, ([address, { token: log, entries }]) => {
        const net = entries.reduce((sum, row) => sum + row.value, 0n)
        return (
          <div key={address}>
            <h3 className="ledger-caption">
              {log.token?.symbol ?? 'Token base units'}
            </h3>
            <p className="mono muted small">{address}</p>
            <UncheckedRows
              entries={entries}
              totalLabel="Net movement"
              total={tokenFigure(log, net)}
            />
          </div>
        )
      })}
    </section>
  )
}

function TechnicalDetails({ tx }: { tx: MinedTxLookup | PendingTxLookup }) {
  const { networkId } = tx
  const network = NETWORKS[networkId]
  const rows: DetailRow[] = []
  function add(label: string, value: DetailRow['value']) {
    rows.push({ id: label, label, value })
  }
  add(
    'Hash',
    <>
      <span className="mono">{tx.hash}</span> <CopyButton text={tx.hash} />
    </>,
  )
  if (network.explorerName)
    add(
      'Explorer',
      <ExplorerLink href={explorerTxUrl(networkId, tx.hash)}>
        View on {network.explorerName} ↗
      </ExplorerLink>,
    )
  if (tx.status === 'mined') {
    add(
      'Status',
      tx.receiptStatus === 'success'
        ? 'Confirmed successfully'
        : 'Execution reverted',
    )
    add(
      'Block',
      <Link to={`/${networkId}/block/${tx.blockNumber}`}>
        {tx.blockNumber.toString()}
      </Link>,
    )
    add('Confirmations', tx.confirmations)
    add(
      'Timestamp',
      `${formatTimestamp(tx.timestamp)} (${formatRelativeAge(tx.timestamp)})`,
    )
  }
  add('From', <AddressValue networkId={networkId} address={tx.from} />)
  add(
    'To',
    <>
      <AddressValue networkId={networkId} address={tx.to} />
      {!tx.to && tx.status === 'mined' && tx.contractAddress && (
        <AddressValue networkId={networkId} address={tx.contractAddress} />
      )}
    </>,
  )
  add('Value', `${formatNative(tx.value)} ${network.nativeSymbol}`)
  if (tx.status === 'mined') {
    add(
      'Execution cost',
      tx.l2ExecutionFeeWei == null
        ? '—'
        : `${formatGwei(tx.l2ExecutionFeeWei)} gwei`,
    )
    const pct = tx.gas
      ? (Number((tx.gasUsed * 1000n) / tx.gas) / 10).toFixed(1)
      : '0.0'
    add('Gas used / limit', `${tx.gasUsed} / ${tx.gas} (${pct}%)`)
    add(
      'Gas price',
      tx.effectiveGasPrice == null
        ? '—'
        : `${formatGwei(tx.effectiveGasPrice)} gwei`,
    )
    add(
      'Nonce · Index · Type',
      `${tx.nonce} · ${tx.transactionIndex ?? '—'} · ${tx.type}`,
    )
  } else {
    add('Nonce', tx.nonce)
    add('Type', tx.type)
  }
  add('Input', <InputValue input={tx.input} />)
  if (tx.status === 'mined')
    add(
      'Events',
      tx.logs.length ? (
        <LogTable networkId={networkId} logs={tx.logs} />
      ) : (
        'No logs.'
      ),
    )
  return <DetailsPanel rows={rows} />
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
            <LogRow
              key={`${log.address}-${i}`}
              networkId={networkId}
              log={log}
            />
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
          {log.fromLabel || log.toLabel ? (
            <div>
              {log.fromLabel ? (
                log.from ? (
                  <Link to={`/${networkId}/address/${log.from}`}>
                    {log.fromLabel}
                  </Link>
                ) : (
                  log.fromLabel
                )
              ) : null}
              {' → '}
              {log.toLabel ? (
                log.to ? (
                  <Link to={`/${networkId}/address/${log.to}`}>
                    {log.toLabel}
                  </Link>
                ) : (
                  log.toLabel
                )
              ) : null}
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
