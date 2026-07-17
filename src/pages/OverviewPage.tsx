import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getBalances, type AddressBalances } from '../chain/balances'
import {
  ENTITIES,
  ROLE_GROUP_ORDER,
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
  const [balances, setBalances] = useState<Record<string, AddressBalances>>({})

  useEffect(() => {
    let cancelled = false
    setBalances({})
    void Promise.all(
      entries.map(async (entry) => {
        const bal = await getBalances(networkId, entry.address)
        if (!cancelled) {
          setBalances((prev) => ({
            ...prev,
            [entry.address.toLowerCase()]: bal,
          }))
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
    for (const entry of entries) {
      map.get(roleGroup(entry.role))!.push(entry)
    }
    return map
  }, [entries])

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

      {ROLE_GROUP_ORDER.map((group) => (
        <section key={group} className="section">
          <h2>{group}</h2>
          <div className="address-list">
            {(grouped.get(group) ?? []).map((entry) => (
              <AddressDirectoryRow
                key={`${entry.networkId}-${entry.address}`}
                entry={entry}
                networkId={networkId}
                balances={balances[entry.address.toLowerCase()]}
              />
            ))}
          </div>
        </section>
      ))}

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
  return (
    <article className="address-row">
      <div className="address-row-main">
        <div className="address-row-title">
          <Link to={`/${networkId}/address/${entry.address}`}>{entry.label}</Link>
          <RoleBadge role={entry.role} />
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
