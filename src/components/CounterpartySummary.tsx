import { Link } from 'react-router'
import {
  counterpartySummary,
  onlyTransfers,
  type TimelineItem,
} from '../chain/transfers'
import { truncateAddress } from '../config/address-book'
import type { NetworkId } from '../config/networks'

function sameAddress(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase()
}

function isSelfSend(item: TimelineItem, self: string) {
  if (item.kind === 'escrow') return false
  return sameAddress(item.from, self) && sameAddress(item.to, self)
}

function amountLines(
  bag: Record<string, { formatted: string }>,
  empty: string,
) {
  const entries = Object.entries(bag)
  if (entries.length === 0) return empty
  return entries.map(([symbol, value]) => `${value.formatted} ${symbol}`).join(', ')
}

export function CounterpartySummary({
  address,
  items,
  networkId,
}: {
  address: string
  items: TimelineItem[]
  networkId: NetworkId
}) {
  const self = address.toLowerCase()
  const rows = counterpartySummary(address, onlyTransfers(items)).filter(
    (row) => !sameAddress(row.address, self),
  )
  const onlySelf = items.length > 0 && items.every((item) => isSelfSend(item, self))

  if (rows.length === 0) {
    if (onlySelf) {
      return (
        <p className="muted">
          Self-sends are the only activity, so they are left out of counterparties.
        </p>
      )
    }
    return <p className="muted">No counterparties yet.</p>
  }

  return (
    <ul className="party-list">
      {rows.map((row) => (
        <li className="party-row" key={row.address}>
          <div className="party-name">
            <Link to={`/${networkId}/address/${row.address}`}>{row.label}</Link>
            <div className="mono muted small">{truncateAddress(row.address)}</div>
          </div>
          <p className="party-amount">In {amountLines(row.inByToken, '—')}</p>
          <p className="party-amount">Out {amountLines(row.outByToken, '—')}</p>
        </li>
      ))}
    </ul>
  )
}
