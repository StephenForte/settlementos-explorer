import { Link, useParams } from 'react-router'
import { isAddress } from 'viem'
import { getBalances } from '../chain/balances'
import { getTransfers } from '../chain/transfers'
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
import { useAsync } from '../hooks/useAsync'

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

  return <AddressDetail networkId={networkId} address={address} />
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
  const transfers = useAsync(`transfers:${networkId}:${address}`, () =>
    getTransfers(networkId, address),
  )

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
        {transfers.status === 'loading' ? (
          <p className="muted">Loading transactions…</p>
        ) : transfers.status === 'error' ? (
          <StatusBanner tone="error">
            Explorer / RPC history failed: {transfers.error}
          </StatusBanner>
        ) : transfers.data.error &&
          !transfers.data.truncated &&
          transfers.data.items.length === 0 ? (
          <StatusBanner tone="error">
            Explorer / RPC history failed: {transfers.data.error}
          </StatusBanner>
        ) : (
          <>
            {transfers.data.error && !transfers.data.truncated ? (
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
            <TransferTable
              items={transfers.data.items}
              self={address}
              networkId={networkId}
            />
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
