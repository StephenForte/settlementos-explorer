import { Link } from 'react-router-dom'
import { counterpartySummary, onlyTransfers, type TimelineItem } from '../chain/transfers'
import { truncateAddress } from '../config/address-book'
import type { NetworkId } from '../config/networks'

export function CounterpartySummary({
  address,
  items,
  networkId,
}: {
  address: string
  items: TimelineItem[]
  networkId: NetworkId
}) {
  const rows = counterpartySummary(address, onlyTransfers(items))
  if (rows.length === 0) {
    return <p className="muted">No counterparties yet.</p>
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Counterparty</th>
            <th>In</th>
            <th>Out</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.address}>
              <td>
                <Link to={`/${networkId}/address/${row.address}`}>{row.label}</Link>
                <div className="mono muted small">{truncateAddress(row.address)}</div>
              </td>
              <td>
                {Object.keys(row.inByToken).length === 0
                  ? '—'
                  : Object.entries(row.inByToken).map(([sym, v]) => (
                      <div key={sym}>
                        {v.formatted} {sym}
                      </div>
                    ))}
              </td>
              <td>
                {Object.keys(row.outByToken).length === 0
                  ? '—'
                  : Object.entries(row.outByToken).map(([sym, v]) => (
                      <div key={sym}>
                        {v.formatted} {sym}
                      </div>
                    ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
