import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router'
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
import { ExplorerLink } from '../components/ExplorerLink'
import { RoleBadge } from '../components/RoleBadge'
import { RpcOverrideForm } from '../components/RpcOverrideForm'
import { Breadcrumbs } from '../components/ui/Breadcrumbs'
import { ReceiptCard } from '../components/ui/ReceiptCard'
import { useNetworkParam } from '../hooks/useNetworkParam'
import { getRpcOverride } from '../lib/rpc-overrides'
import '../styles/overview.css'

function hasUnavailable(balances: AddressBalances): boolean {
  if (balances.native.status === 'unavailable') return true
  return balances.tokens.some((t) => t.status === 'unavailable')
}

export function OverviewPage() {
  const { networkId } = useNetworkParam()
  const entries = useMemo(() => getAddressesForNetwork(networkId), [networkId])
  const [query, setQuery] = useState('')
  const [balances, setBalances] = useState<Record<string, AddressBalances>>({})
  const [balancesLoaded, setBalancesLoaded] = useState(0)
  const [balancesStartedAt, setBalancesStartedAt] = useState<number | null>(null)
  // Primitive reload token — bump only from RpcOverrideForm onChanged.
  // Do not derive this from render-time identity (objects, Date.now(), etc.)
  // or the effect will fan out getBalances in a loop (PLAN §6 trap 9 / D14).
  const [balanceReloadToken, setBalanceReloadToken] = useState(0)
  // Once the page-level RPC control has been shown for this network, keep it
  // mounted through reloads where balances is briefly {}. Reset on network
  // change — OverviewPage is reused across /:networkId without remounting.
  const [rpcOverrideSticky, setRpcOverrideSticky] = useState(false)

  const filtered = useMemo(
    () => filterAddressEntries(entries, query),
    [entries, query],
  )

  useEffect(() => {
    setQuery('')
    setRpcOverrideSticky(false)
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
  }, [entries, networkId, balanceReloadToken])

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

  // Page-level control (one override per network). Mount when useful so
  // defaultOpen applies on first paint of the failure — BalanceChips-style.
  // Latch during render (boolean primitive) rather than in an effect: an
  // effect on needsRpcOverride would re-latch from the previous network's
  // balances before the fetch effect clears them.
  const needsRpcOverride =
    Boolean(getRpcOverride(networkId)) ||
    Object.values(balances).some(hasUnavailable)
  if (needsRpcOverride && !rpcOverrideSticky) {
    setRpcOverrideSticky(true)
  }
  const showRpcOverride = rpcOverrideSticky || needsRpcOverride

  return (
    <div className="page overview-page">
      <Breadcrumbs
        items={[
          { label: NETWORKS[networkId].name, href: `/${networkId}` },
          { label: 'Overview' },
        ]}
      />

      <ReceiptCard
        title="SettlementOS address directory"
        note="Every known contract, operator, treasury, and entity wallet on this testnet — labeled from the address book, balances read live from public RPCs."
        action={
          <Link className="btn-primary" to={`/${networkId}/graph`}>
            Open relationship graph
          </Link>
        }
      >
        <div className="directory-toolbar" aria-label="Directory filters">
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
        </div>
      </ReceiptCard>

      {showRpcOverride ? (
        <section className="section" aria-label="RPC endpoint override">
          <RpcOverrideForm
            networkId={networkId}
            defaultOpen
            onChanged={() => setBalanceReloadToken((n) => n + 1)}
          />
        </section>
      ) : null}

      {entries.length === 0 ? (
        <section className="section">
          <p className="muted">
            No address book entries for {NETWORKS[networkId].name} yet. After
            SettlementOS deploys, copy public addresses from{' '}
            <span className="mono">
              chain/deployments.{networkId}.json
            </span>{' '}
            into{' '}
            <span className="mono">src/config/address-book.ts</span>.
          </p>
        </section>
      ) : filtered.length === 0 ? (
        <section className="section">
          <p className="muted">No addresses match “{query.trim()}”.</p>
        </section>
      ) : (
        <div className="overview-groups">
          {ROLE_GROUP_ORDER.map((group) => {
            const rows = grouped.get(group) ?? []
            if (rows.length === 0) return null
            return (
              <section key={group} className="overview-group">
                <h2>{group}</h2>
                {rows.map((entry) => (
                  <AddressDirectoryRow
                    key={`${entry.networkId}-${entry.address}`}
                    entry={entry}
                    networkId={networkId}
                    balances={balances[entry.address.toLowerCase()]}
                  />
                ))}
              </section>
            )
          })}
        </div>
      )}

      <ReceiptCard
        title="Entities across networks"
        note="One entity, one wallet per live network — follow settlement paths across Base Sepolia, ForteL2, and Polygon Amoy."
      >
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
      </ReceiptCard>
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
    <div
      className="overview-address"
      role="link"
      tabIndex={0}
      onClick={onRowClick}
      onKeyDown={onRowKeyDown}
      aria-label={`View transactions for ${entry.label}`}
    >
      <ReceiptCard
        status={<RoleBadge role={entry.role} />}
        title={<Link to={detailPath}>{entry.label}</Link>}
      >
        <div className="overview-address-meta">
          <span className="mono">{truncateAddress(entry.address)}</span>
          <CopyButton text={entry.address} />
          {NETWORKS[networkId].explorerName ? (
            <ExplorerLink href={explorerAddressUrl(networkId, entry.address)}>
              {NETWORKS[networkId].explorerName} ↗
            </ExplorerLink>
          ) : null}
          {entry.entityId ? (
            <Link to={`/entity/${entry.entityId}`}>Entity page</Link>
          ) : null}
          <span className="row-hint">View txs →</span>
        </div>
        <BalanceChips balances={balances} />
      </ReceiptCard>
    </div>
  )
}
