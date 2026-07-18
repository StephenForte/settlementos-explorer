import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getBalances, type AddressBalances } from '../chain/balances'
import {
  ENTITIES,
  ROLE_GROUP_ORDER,
  filterAddressEntries,
  getAddressesForNetwork,
  roleGroup,
  truncateAddress,
  type AddressEntry,
} from '../config/address-book'
import {
  explorerAddressUrl,
  NETWORKS,
  type NetworkId,
} from '../config/networks'
import { BalanceChips } from '../components/BalanceChips'
import { CopyButton } from '../components/CopyButton'
import { RoleBadge } from '../components/RoleBadge'
import { useNetworkParam } from '../hooks/useNetworkParam'

export function OverviewPage() {
  const { networkId } = useNetworkParam()
  const entries = useMemo(() => getAddressesForNetwork(networkId), [networkId])
  const [query, setQuery] = useState('')
  const [balances, setBalances] = useState<Record<string, AddressBalances>>({})
  const [balancesLoaded, setBalancesLoaded] = useState(0)
  const [balancesStartedAt, setBalancesStartedAt] = useState<number | null>(null)

  const filtered = useMemo(
    () => filterAddressEntries(entries, query),
    [entries, query],
  )

  useEffect(() => {
    setQuery('')
  }, [networkId])

  useEffect(() => {
    let cancelled = false
    setBalances({})
    setBalancesLoaded(0)
    setBalancesStartedAt(Date.now())
    void Promise.all(
      entries.map(async (entry) => {
        const bal = await getBalances(networkId, entry.address)
        if (!cancelled) {
          setBalances((prev) => ({
            ...prev,
            [entry.address.toLowerCase()]: bal,
          }))
          setBalancesLoaded((n) => n + 1)
        }
      }),
    )
    return () => {
      cancelled = true
    }
  }, [entries, networkId])

  const grouped = useMemo(() => {
    const map = new Map<string, AddressEntry[]>()
    for (const group of ROLE_GROUP_ORDER) map.set(group, [])
    for (const entry of filtered) {
      map.get(roleGroup(entry.role))!.push(entry)
    }
    return map
  }, [filtered])

  const loadingBalances = balancesLoaded < entries.length
  const freshnessLabel =
    !loadingBalances && balancesStartedAt
      ? `Balances as of ${new Date(balancesStartedAt).toLocaleTimeString()}`
      : loadingBalances
        ? `Loading balances ${balancesLoaded}/${entries.length}…`
        : null

  return (
    <div className="page">
      <section className="hero-block">
        <p className="eyebrow">{NETWORKS[networkId].name}</p>
        <h1>SettlementOS address directory</h1>
        <p className="lede">
          Every known contract, operator, treasury, and entity wallet on this
          testnet — labeled from the address book, balances read live from public
          RPCs.
        </p>
        <div className="cta-row">
          <Link className="btn-primary" to={`/${networkId}/graph`}>
            Open relationship graph
          </Link>
        </div>
      </section>

      <section className="directory-toolbar" aria-label="Directory filters">
        <label className="directory-search">
          <span className="visually-hidden">Filter addresses</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by label, role, or address…"
            autoComplete="off"
          />
        </label>
        <p className="directory-meta muted">
          {filtered.length === entries.length
            ? `${entries.length} addresses`
            : `${filtered.length} of ${entries.length} addresses`}
          {freshnessLabel ? ` · ${freshnessLabel}` : null}
        </p>
      </section>

      {filtered.length === 0 ? (
        <section className="section">
          <p className="muted">No addresses match “{query.trim()}”.</p>
        </section>
      ) : (
        ROLE_GROUP_ORDER.map((group) => {
          const rows = grouped.get(group) ?? []
          if (rows.length === 0) return null
          return (
            <section key={group} className="section">
              <h2>{group}</h2>
              <div className="address-list">
                {rows.map((entry) => (
                  <AddressDirectoryRow
                    key={`${entry.networkId}-${entry.address}`}
                    entry={entry}
                    networkId={networkId}
                    balances={balances[entry.address.toLowerCase()]}
                  />
                ))}
              </div>
            </section>
          )
        })
      )}

      <section className="section">
        <h2>Entities across networks</h2>
        <p className="muted">
          One entity, two wallets — follow the USD→JPY path from Base Sepolia
          escrow to Amoy payout.
        </p>
        <div className="entity-links">
          {ENTITIES.map((entity) => (
            <Link
              key={entity.entityId}
              className="entity-chip"
              to={`/entity/${entity.entityId}`}
            >
              {entity.displayName}
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

function AddressDirectoryRow({
  entry,
  networkId,
  balances,
}: {
  entry: AddressEntry
  networkId: NetworkId
  balances?: AddressBalances
}) {
  const navigate = useNavigate()
  const detailPath = `/${networkId}/address/${entry.address}`

  const goDetail = () => navigate(detailPath)

  const onRowClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('a, button')) return
    goDetail()
  }

  const onRowKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      goDetail()
    }
  }

  return (
    <article
      className="address-row address-row-clickable"
      role="link"
      tabIndex={0}
      onClick={onRowClick}
      onKeyDown={onRowKeyDown}
      aria-label={`View transactions for ${entry.label}`}
    >
      <div className="address-row-main">
        <div className="address-row-title">
          <Link to={detailPath}>{entry.label}</Link>
          <RoleBadge role={entry.role} />
          <span className="row-hint">View txs →</span>
        </div>
        <div className="address-row-meta">
          <span className="mono">{truncateAddress(entry.address)}</span>
          <CopyButton text={entry.address} />
          <a
            href={explorerAddressUrl(networkId, entry.address)}
            target="_blank"
            rel="noreferrer"
          >
            {NETWORKS[networkId].explorerName} ↗
          </a>
          {entry.entityId ? (
            <Link to={`/entity/${entry.entityId}`}>Entity page</Link>
          ) : null}
        </div>
      </div>
      <BalanceChips balances={balances} />
    </article>
  )
}
