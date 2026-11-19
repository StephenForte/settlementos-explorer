import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { isAddress } from 'viem'
import { getBalances } from '../chain/balances'
import {
  getTransfers,
  type NativeTxEvent,
  type TransfersResult,
} from '../chain/transfers'
import {
  getEntityWallets,
  lookupAddress,
  truncateAddress,
} from '../config/address-book'
import {
  explorerAddressUrl,
  isNetworkId,
  NETWORKS,
  type NetworkId,
} from '../config/networks'
import { BalanceChips } from '../components/BalanceChips'
import { CopyButton } from '../components/CopyButton'
import { CounterpartySummary } from '../components/CounterpartySummary'
import { ExplorerLink } from '../components/ExplorerLink'
import { RoleBadge } from '../components/RoleBadge'
import { RpcOverrideForm } from '../components/RpcOverrideForm'
import { StatusBanner } from '../components/StatusBanner'
import { TransferTable } from '../components/TransferTable'
import { useAsync, type AsyncState } from '../hooks/useAsync'

export function AddressDetailPage() {
  const { networkId: rawNetwork, address: rawAddress = '' } = useParams()
  const networkId = rawNetwork && isNetworkId(rawNetwork) ? rawNetwork : null
  const address = rawAddress

  if (!networkId || !isAddress(address)) {
    return (
      <div className="page">
        <StatusBanner tone="error">Invalid network or address.</StatusBanner>
      </div>
    )
  }

  return <AddressDetail key={`${networkId}:${address}`} networkId={networkId} address={address} />
}

function useTransferHistory(networkId: NetworkId, address: string) {
  const [attempt, setAttempt] = useState(0)
  const [progress, setProgress] = useState<NativeTxEvent[]>([])
  const [state, setState] = useState<AsyncState<TransfersResult>>({ status: 'loading' })

  useEffect(() => {
    let active = true
    setProgress([])
    setState({ status: 'loading' })
    void getTransfers(networkId, address, (items) => {
      if (active) setProgress(items)
    }).then(
      (data) => {
        if (active) setState({ status: 'ok', data })
      },
      (err: unknown) => {
        if (active) setState({
          status: 'error',
          error: err instanceof Error ? err.message : 'Request failed',
        })
      },
    )
    return () => { active = false }
  }, [networkId, address, attempt])

  return { ...state, progress, retry: () => setAttempt((value) => value + 1) }
}

function AddressDetail({
  networkId,
  address,
}: {
  networkId: NetworkId
  address: string
}) {
  const entry = lookupAddress(networkId, address)
  const balances = useAsync(`balances:${networkId}:${address}`, () =>
    getBalances(networkId, address),
  )
  const transfers = useTransferHistory(networkId, address)
  const fullHistory = !NETWORKS[networkId].etherscanApi
  const result = transfers.status === 'ok' ? transfers.data : undefined
  const gaps = result?.coverage?.gaps ?? []
  const sent = result?.coverage?.sent
  const coverageMessage = fullHistory && result?.coverage && (result.error || gaps.length > 0)
    ? [
        sent ? `Showing ${sent.found} of ${sent.expected} sent transactions.`
          : 'The total number of sent transactions is unavailable.',
        ...gaps.map((gap) => `${gap}.`),
        ...(result.error ? [`${result.error}.`] : []),
      ].join(' ')
    : undefined

  const otherWallets =
    entry?.entityId != null
      ? getEntityWallets(entry.entityId).filter((w) => w.networkId !== networkId)
      : []

  const explorerName = NETWORKS[networkId].explorerName

  return (
    <div className="page">
      <section className="detail-header">
        <p className="eyebrow">{NETWORKS[networkId].name}</p>
        <div className="detail-title-row">
          <h1>{entry?.label ?? 'Unknown address'}</h1>
          {entry ? (
            <RoleBadge role={entry.role} />
          ) : (
            <span className="role-badge role-external">External</span>
          )}
        </div>
        <div className="address-row-meta">
          <span className="mono break">{address}</span>
          <CopyButton text={address} />
          {explorerName ? (
            <ExplorerLink href={explorerAddressUrl(networkId, address)}>
              View on {explorerName} ↗
            </ExplorerLink>
          ) : null}
        </div>
        {entry?.entityId ? (
          <p>
            <Link to={`/entity/${entry.entityId}`}>Open entity page</Link>
          </p>
        ) : null}
      </section>

      {otherWallets.map((otherWallet) => (
        <StatusBanner key={otherWallet.networkId}>
          Same entity on {NETWORKS[otherWallet.networkId].name}:{' '}
          <Link to={`/${otherWallet.networkId}/address/${otherWallet.address}`}>
            {truncateAddress(otherWallet.address)}
          </Link>
        </StatusBanner>
      ))}

      <section className="section">
        <div className="section-head">
          <h2>Balances</h2>
          {balances.status === 'error' ? (
            <button type="button" className="btn-ghost" onClick={balances.retry}>
              Retry
            </button>
          ) : null}
        </div>
        {balances.status === 'loading' ? (
          <p className="muted">Loading from public RPC…</p>
        ) : balances.status === 'error' ? (
          <>
            <StatusBanner tone="error">
              RPC unavailable: {balances.error}
            </StatusBanner>
            <RpcOverrideForm
              networkId={networkId}
              defaultOpen
              onChanged={() => {
                balances.retry()
                transfers.retry()
              }}
            />
          </>
        ) : (
          <BalanceChips
            balances={balances.data}
            networkId={networkId}
            onRpcOverrideChange={() => {
              balances.retry()
              transfers.retry()
            }}
          />
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Transactions</h2>
          {transfers.status === 'error' ? (
            <button type="button" className="btn-ghost" onClick={transfers.retry}>
              Retry
            </button>
          ) : null}
        </div>
        <p className="muted small">
          Native {NETWORKS[networkId].nativeSymbol} transfers and SettlementOS
          token transfers, newest first.
          {explorerName
            ? ` Each tx links to ${explorerName}.`
            : ' Tx hashes are shown raw (no public explorer yet).'}
        </p>
        {fullHistory ? (
          <p className="muted small">
            Incoming zero-value transactions may be missing without an indexer.
            Native transfers can also be missed when multiple changes leave the
            same balance between sampled blocks.
          </p>
        ) : null}
        {transfers.status === 'loading' ? (
          <>
            <p className="muted">Loading transactions…</p>
            {transfers.progress.length > 0 ? (
              <TransferTable items={transfers.progress} self={address} networkId={networkId} />
            ) : null}
          </>
        ) : transfers.status === 'error' ? (
          <StatusBanner tone="error">
            Explorer / RPC history failed: {transfers.error}
          </StatusBanner>
        ) : !coverageMessage && transfers.data.error &&
          !transfers.data.truncated &&
          transfers.data.items.length === 0 ? (
          <StatusBanner tone="error">
            Explorer / RPC history failed: {transfers.data.error}
          </StatusBanner>
        ) : (
          <>
            {coverageMessage ? (
              <StatusBanner tone="warn">Partial history. {coverageMessage}</StatusBanner>
            ) : null}
            {!coverageMessage && transfers.data.error && !transfers.data.truncated ? (
              <StatusBanner tone="warn">
                Partial history: {transfers.data.error}
              </StatusBanner>
            ) : null}
            {transfers.data.truncated && NETWORKS[networkId].etherscanApi ? (
              <StatusBanner tone="warn">
                Recent activity only — explorer API unavailable
                {transfers.data.error ? ` (${transfers.data.error})` : ''};
                showing eth_getLogs fallback (token transfers only).
              </StatusBanner>
            ) : null}
            {fullHistory && transfers.data.items.length === 0 ? (
              coverageMessage ? null : <p className="muted">No transactions found.</p>
            ) : (
              <TransferTable items={transfers.data.items} self={address} networkId={networkId} />
            )}
          </>
        )}
      </section>

      <section className="section">
        <h2>Counterparties</h2>
        {transfers.status === 'ok' ? (
          <CounterpartySummary
            address={address}
            items={transfers.data.items}
            networkId={networkId}
          />
        ) : (
          <p className="muted">Awaiting transfer history…</p>
        )}
      </section>
    </div>
  )
}
