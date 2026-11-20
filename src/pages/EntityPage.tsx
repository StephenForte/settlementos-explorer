import { Link, useParams } from 'react-router'
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
import { TxLink } from '../components/TxLink'
import { AmountDisplay } from '../components/ui/AmountDisplay'
import { Breadcrumbs } from '../components/ui/Breadcrumbs'
import { ReceiptCard } from '../components/ui/ReceiptCard'
import { useAsync } from '../hooks/useAsync'
import { formatTimestamp } from '../lib/format'
import '../styles/entity.css'

export function EntityPage() {
  const { entityId: raw } = useParams()
  if (!raw || !isEntityId(raw)) {
    return (
      <div className="page entity-page">
        <ReceiptCard tone="failed" title="Unknown entity">
          <StatusBanner tone="error">Unknown entity.</StatusBanner>
        </ReceiptCard>
      </div>
    )
  }

  const entity = getEntity(raw)!
  const wallets = getEntityWallets(raw)
  const addressWord = wallets.length === 1 ? 'address' : 'addresses'

  return (
    <div className="page entity-page">
      <Breadcrumbs
        items={[
          { label: 'Overview', href: '/base-sepolia' },
          { label: entity.displayName },
        ]}
      />
      <ReceiptCard
        title={entity.displayName}
        note="Wallets and activity across Base Sepolia, ForteL2 Sepolia, and Polygon Amoy, joined into one timeline so settlement paths are visible end-to-end."
      >
        <AmountDisplay
          label="Known addresses"
          amount={String(wallets.length)}
          unit={addressWord}
        />
        <ul className="entity-address-list">
          {wallets.map((wallet) => (
            <li key={wallet.networkId}>
              <Link to={`/${wallet.networkId}/address/${wallet.address}`}>
                {NETWORKS[wallet.networkId].name}
              </Link>
              <span className="mono break">{wallet.address}</span>
            </li>
          ))}
        </ul>
      </ReceiptCard>

      <div className="entity-wallets">
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
    <ReceiptCard
      title={NETWORKS[networkId].name}
      action={
        <Link to={`/${networkId}/address/${address}`}>Address detail</Link>
      }
    >
      <p className="entity-wallet-address">
        <span className="mono small break">{address}</span>
      </p>
      {balances.status === 'ok' ? (
        <BalanceChips
          balances={balances.data}
          networkId={networkId}
          onRpcOverrideChange={() => {
            balances.retry()
            transfers.retry()
          }}
        />
      ) : balances.status === 'error' ? (
        <StatusBanner tone="warn">
          Balances unavailable (RPC): {balances.error}
        </StatusBanner>
      ) : (
        <p className="muted">Loading balances…</p>
      )}
      <h3>Recent transfers</h3>
      {transfers.status === 'ok' ? (
        transfers.data.error &&
        !transfers.data.truncated &&
        transfers.data.items.length === 0 ? (
          <StatusBanner tone="warn">
            History unavailable: {transfers.data.error}
          </StatusBanner>
        ) : (
          <>
            {transfers.data.error && !transfers.data.truncated ? (
              <StatusBanner tone="warn">
                Partial history: {transfers.data.error}
              </StatusBanner>
            ) : null}
            {transfers.data.truncated && NETWORKS[networkId].etherscanApi ? (
              <StatusBanner tone="warn">Recent activity only (RPC fallback)</StatusBanner>
            ) : null}
            <TransferTable
              items={transfers.data.items.slice(0, 10)}
              self={address}
              networkId={networkId}
            />
          </>
        )
      ) : transfers.status === 'error' ? (
        <StatusBanner tone="warn">
          History unavailable: {transfers.error}
        </StatusBanner>
      ) : (
        <p className="muted">Loading history…</p>
      )}
    </ReceiptCard>
  )
}

function MergedTimeline({
  wallets,
}: {
  wallets: Array<{ networkId: NetworkId; address: string }>
}) {
  const key = wallets.map((w) => `${w.networkId}:${w.address}`).join('|')
  const merged = useAsync(`merged:${key}`, async () => {
    // Per-wallet failures (e.g. ForteL2 RPC history) must not hide other
    // networks' activity from the merged timeline.
    const settled = await Promise.allSettled(
      wallets.map(async (w) => {
        const res = await getTransfers(w.networkId, w.address)
        return {
          networkId: w.networkId,
          items: res.items.map((item) => ({
            ...item,
            networkId: w.networkId,
          })) as TimelineItem[],
          softError:
            res.error && !res.truncated ? res.error : undefined,
        }
      }),
    )

    const items: TimelineItem[] = []
    const failures: Array<{ networkId: NetworkId; error: string }> = []

    for (let i = 0; i < settled.length; i++) {
      const result = settled[i]!
      const wallet = wallets[i]!
      if (result.status === 'fulfilled') {
        items.push(...result.value.items)
        if (result.value.softError) {
          failures.push({
            networkId: wallet.networkId,
            error: result.value.softError,
          })
        }
      } else {
        failures.push({
          networkId: wallet.networkId,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : 'History unavailable',
        })
      }
    }

    items.sort((a, b) => {
      const tb = b.timestamp ?? 0
      const ta = a.timestamp ?? 0
      if (tb !== ta) return tb - ta
      return b.blockNumber - a.blockNumber
    })

    if (items.length === 0 && failures.length === wallets.length) {
      throw new Error(
        failures
          .map((f) => `${NETWORKS[f.networkId].name}: ${f.error}`)
          .join('; '),
      )
    }

    return { items, failures }
  })

  return (
    <section className="section">
      <ReceiptCard title="Merged activity">
        {merged.status === 'loading' ? (
          <p className="muted">Merging timelines…</p>
        ) : merged.status === 'error' ? (
          <StatusBanner tone="error">{merged.error}</StatusBanner>
        ) : (
          <>
            {merged.data.failures.length > 0 ? (
              <StatusBanner tone="warn">
                Partial history:{' '}
                {merged.data.failures
                  .map(
                    (f) =>
                      `${NETWORKS[f.networkId].name} unavailable (${f.error})`,
                  )
                  .join('; ')}
              </StatusBanner>
            ) : null}
            {merged.data.items.length === 0 ? (
              <p className="muted">No activity yet across networks.</p>
            ) : (
              <ol className="entity-timeline">
                {merged.data.items.slice(0, 40).map((item) => {
                  if (item.kind === 'transfer') {
                    return (
                      <li
                        className="entity-timeline-item"
                        key={`t-${item.networkId}-${item.txHash}-${item.from}-${item.to}-${item.token.address}`}
                      >
                        <div>{NETWORKS[item.networkId].name}</div>
                        <div>
                          {item.fromLabel} → {item.toLabel}
                          <div className="muted small">Token transfer</div>
                        </div>
                        <div>
                          {item.amountFormatted} {item.token.symbol}
                        </div>
                        <div>{formatTimestamp(item.timestamp)}</div>
                        <TxLink
                          networkId={item.networkId}
                          hash={item.txHash}
                          className="mono"
                        >
                          {truncateAddress(item.txHash, 6)}
                        </TxLink>
                      </li>
                    )
                  }
                  if (item.kind === 'native') {
                    return (
                      <li
                        className="entity-timeline-item"
                        key={`n-${item.networkId}-${item.txHash}-${item.from}-${item.to}`}
                      >
                        <div>{NETWORKS[item.networkId].name}</div>
                        <div>
                          {item.fromLabel} → {item.toLabel}
                          <div className="muted small">
                            Native {item.symbol}
                            {item.method ? ` · ${item.method}` : ''}
                          </div>
                        </div>
                        <div>
                          {item.amountFormatted} {item.symbol}
                        </div>
                        <div>{formatTimestamp(item.timestamp)}</div>
                        <TxLink
                          networkId={item.networkId}
                          hash={item.txHash}
                          className="mono"
                        >
                          {truncateAddress(item.txHash, 6)}
                        </TxLink>
                      </li>
                    )
                  }
                  return (
                    <li
                      className="entity-timeline-item"
                      key={`e-${item.networkId}-${item.txHash}-${item.eventName}`}
                    >
                      <div>{NETWORKS[item.networkId].name}</div>
                      <div>{item.eventName}</div>
                      <div>
                        {item.amountFormatted
                          ? `${item.amountFormatted}${item.token ? ` ${item.token.symbol}` : ''}`
                          : '—'}
                      </div>
                      <div>{formatTimestamp(item.timestamp)}</div>
                      <TxLink
                        networkId={item.networkId}
                        hash={item.txHash}
                        className="mono"
                      >
                        {truncateAddress(item.txHash, 6)}
                      </TxLink>
                    </li>
                  )
                })}
              </ol>
            )}
          </>
        )}
      </ReceiptCard>
    </section>
  )
}
