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
import {
  Breadcrumbs,
  DetailsPanel,
  PageSplit,
  ReceiptCard,
  StatusPill,
  type DetailRow,
} from '../components/ui'
import '../styles/address.css'

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
  const coverageDetails = [...(result?.coverage?.gaps ?? [])]
  if (result?.error) coverageDetails.push(result.error)
  const sent = result?.coverage?.sent
  const coverageMessage = fullHistory && result?.coverage && coverageDetails.length > 0
    ? [
        sent ? `Showing ${sent.found} of ${sent.expected} sent transactions.`
          : 'The total number of sent transactions is unavailable.',
        ...coverageDetails.map((detail) => `${detail.charAt(0).toUpperCase()}${detail.slice(1)}.`),
      ].join(' ')
    : undefined

  const otherWallets =
    entry?.entityId != null
      ? getEntityWallets(entry.entityId).filter((w) => w.networkId !== networkId)
      : []

  const explorerName = NETWORKS[networkId].explorerName
  const label = entry?.label ?? 'Unknown address'

  const detailRows: DetailRow[] = [
    { id: 'network', label: 'Network', value: NETWORKS[networkId].name },
    { id: 'address', label: 'Address', value: <span className="mono break">{address}</span> },
  ]
  if (explorerName) {
    detailRows.push({
      id: 'explorer',
      label: 'Explorer',
      value: (
        <ExplorerLink href={explorerAddressUrl(networkId, address)}>
          View on {explorerName}
        </ExplorerLink>
      ),
    })
  }
  if (entry?.entityId) {
    detailRows.push({
      id: 'entity',
      label: 'Entity page',
      value: <Link to={`/entity/${entry.entityId}`}>Open entity page</Link>,
    })
  }

  return (
    <div className="page address-page">
      <Breadcrumbs
        items={[
          { label: NETWORKS[networkId].name, href: `/${networkId}` },
          { label },
        ]}
      />

      {coverageMessage ? (
        <div className="address-coverage" data-testid="coverage-banner">
          <StatusBanner tone="warn">
            <span className="address-coverage-line">
              <StatusPill status="pending">Partial</StatusPill>
              <span className="address-coverage-copy">Partial history. {coverageMessage}</span>
            </span>
          </StatusBanner>
        </div>
      ) : null}

      {otherWallets.map((otherWallet) => (
        <StatusBanner key={otherWallet.networkId}>
          Same entity on {NETWORKS[otherWallet.networkId].name}:{' '}
          <Link to={`/${otherWallet.networkId}/address/${otherWallet.address}`}>
            {truncateAddress(otherWallet.address)}
          </Link>
        </StatusBanner>
      ))}

      <PageSplit
        main={
          <>
            <ReceiptCard
              status={
                entry ? (
                  <RoleBadge role={entry.role} />
                ) : (
                  <span className="role-badge role-external">External</span>
                )
              }
              title={label}
              note={NETWORKS[networkId].name}
            >
              <div className="address-identity">
                <span className="mono break">{address}</span>
                <CopyButton text={address} />
              </div>
              {entry?.entityId ? (
                <p>
                  <Link to={`/entity/${entry.entityId}`}>Open entity page</Link>
                </p>
              ) : null}
              {balances.status === 'loading' ? (
                <p className="muted">Loading from public RPC…</p>
              ) : balances.status === 'error' ? (
                <>
                  <div className="section-head">
                    <StatusBanner tone="error">
                      RPC unavailable: {balances.error}
                    </StatusBanner>
                    <button type="button" className="btn-ghost" onClick={balances.retry}>
                      Retry
                    </button>
                  </div>
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
                  layout="figures"
                  balances={balances.data}
                  networkId={networkId}
                  onRpcOverrideChange={() => {
                    balances.retry()
                    transfers.retry()
                  }}
                />
              )}
            </ReceiptCard>

            <section className="section">
              <div className="section-head">
                <h2>Activity</h2>
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
                    <TransferTable
                      items={transfers.progress}
                      self={address}
                      networkId={networkId}
                      presentation="list"
                      markSelf
                      decodeMethods
                    />
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
                    <TransferTable
                      items={transfers.data.items}
                      self={address}
                      networkId={networkId}
                      presentation="list"
                      markSelf
                      decodeMethods
                    />
                  )}
                </>
              )}
            </section>
          </>
        }
        side={
          <>
            <DetailsPanel title="Technical details" rows={detailRows} />
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
          </>
        }
      />
    </div>
  )
}
