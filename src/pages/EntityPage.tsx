import { Link, useParams } from 'react-router-dom'
import { getBalances } from '../chain/balances'
import { getTransfers, type TimelineItem } from '../chain/transfers'
import {
  getEntity,
  getEntityWallets,
  isEntityId,
  truncateAddress,
} from '../config/address-book'
import { NETWORKS, type NetworkId } from '../config/networks'
import { BalanceChips } from '../components/BalanceChips'
import { StatusBanner } from '../components/StatusBanner'
import { TransferTable } from '../components/TransferTable'
import { useAsync } from '../hooks/useAsync'
import { formatTimestamp } from '../lib/format'
import { explorerTxUrl } from '../config/networks'

export function EntityPage() {
  const { entityId: raw } = useParams()
  if (!raw || !isEntityId(raw)) {
    return (
      <div className="page">
        <StatusBanner tone="error">Unknown entity.</StatusBanner>
      </div>
    )
  }

  const entity = getEntity(raw)!
  const wallets = getEntityWallets(raw)

  return (
    <div className="page">
      <section className="detail-header">
        <p className="eyebrow">Cross-network entity</p>
        <h1>{entity.displayName}</h1>
        <p className="lede">
          Wallets and activity on Base Sepolia and Polygon Amoy, joined into one
          timeline so the USD→JPY settlement path is visible end-to-end.
        </p>
      </section>

      <div className="entity-grid">
        {wallets.map((wallet) => (
          <NetworkWalletPanel
            key={wallet.networkId}
            networkId={wallet.networkId}
            address={wallet.address}
          />
        ))}
      </div>

      <MergedTimeline wallets={wallets.map((w) => ({ networkId: w.networkId, address: w.address }))} />
    </div>
  )
}

function NetworkWalletPanel({
  networkId,
  address,
}: {
  networkId: NetworkId
  address: string
}) {
  const balances = useAsync(`entity-bal:${networkId}:${address}`, () =>
    getBalances(networkId, address),
  )
  const transfers = useAsync(`entity-xfers:${networkId}:${address}`, () =>
    getTransfers(networkId, address),
  )

  return (
    <section className="section panel">
      <div className="section-head">
        <h2>{NETWORKS[networkId].name}</h2>
        <Link to={`/${networkId}/address/${address}`}>Address detail</Link>
      </div>
      <p className="mono small break">{address}</p>
      {balances.status === 'ok' ? (
        <BalanceChips balances={balances.data} />
      ) : balances.status === 'error' ? (
        <StatusBanner tone="warn">
          Balances unavailable (RPC): {balances.error}
        </StatusBanner>
      ) : (
        <p className="muted">Loading balances…</p>
      )}
      <h3>Recent transfers</h3>
      {transfers.status === 'ok' ? (
        <>
          {transfers.data.truncated ? (
            <StatusBanner tone="warn">Recent activity only (RPC fallback)</StatusBanner>
          ) : null}
          <TransferTable
            items={transfers.data.items.slice(0, 10)}
            self={address}
            networkId={networkId}
          />
        </>
      ) : transfers.status === 'error' ? (
        <StatusBanner tone="warn">
          History unavailable: {transfers.error}
        </StatusBanner>
      ) : (
        <p className="muted">Loading history…</p>
      )}
    </section>
  )
}

function MergedTimeline({
  wallets,
}: {
  wallets: Array<{ networkId: NetworkId; address: string }>
}) {
  const key = wallets.map((w) => `${w.networkId}:${w.address}`).join('|')
  const merged = useAsync(`merged:${key}`, async () => {
    const results = await Promise.all(
      wallets.map(async (w) => {
        const res = await getTransfers(w.networkId, w.address)
        return res.items.map((item) => ({ ...item, networkId: w.networkId }))
      }),
    )
    const items = results.flat() as TimelineItem[]
    items.sort((a, b) => {
      const tb = b.timestamp ?? 0
      const ta = a.timestamp ?? 0
      if (tb !== ta) return tb - ta
      return b.blockNumber - a.blockNumber
    })
    return items
  })

  return (
    <section className="section">
      <h2>Merged activity</h2>
      {merged.status === 'loading' ? (
        <p className="muted">Merging timelines…</p>
      ) : merged.status === 'error' ? (
        <StatusBanner tone="error">{merged.error}</StatusBanner>
      ) : merged.data.length === 0 ? (
        <p className="muted">No activity yet across networks.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Network</th>
                <th>Event</th>
                <th>Amount</th>
                <th>Time</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {merged.data.slice(0, 40).map((item) => {
                if (item.kind === 'transfer') {
                  return (
                    <tr
                      key={`${item.networkId}-${item.txHash}-${item.from}-${item.to}-${item.token.address}`}
                    >
                      <td>{NETWORKS[item.networkId].name}</td>
                      <td>
                        {item.fromLabel} → {item.toLabel}
                      </td>
                      <td>
                        {item.amountFormatted} {item.token.symbol}
                      </td>
                      <td>{formatTimestamp(item.timestamp)}</td>
                      <td>
                        <a
                          href={explorerTxUrl(item.networkId, item.txHash)}
                          target="_blank"
                          rel="noreferrer"
                          className="mono"
                        >
                          {truncateAddress(item.txHash, 6)}
                        </a>
                      </td>
                    </tr>
                  )
                }
                return (
                  <tr key={`${item.networkId}-${item.txHash}-${item.eventName}`}>
                    <td>{NETWORKS[item.networkId].name}</td>
                    <td>{item.eventName}</td>
                    <td>
                      {item.amountFormatted
                        ? `${item.amountFormatted}${item.token ? ` ${item.token.symbol}` : ''}`
                        : '—'}
                    </td>
                    <td>{formatTimestamp(item.timestamp)}</td>
                    <td>
                      <a
                        href={explorerTxUrl(item.networkId, item.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="mono"
                      >
                        {truncateAddress(item.txHash, 6)}
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
