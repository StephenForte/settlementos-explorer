import { Link } from 'react-router-dom'
import type {
  NativeTxEvent,
  TimelineItem,
  TransferEvent,
} from '../chain/transfers'
import { explorerTxUrl, type NetworkId } from '../config/networks'
import { truncateAddress } from '../config/address-book'
import { formatTimestamp } from '../lib/format'

function TransferRow({
  item,
  self,
  networkId,
}: {
  item: TransferEvent
  self: string
  networkId: NetworkId
}) {
  const outgoing = item.from.toLowerCase() === self.toLowerCase()
  const counterparty = outgoing ? item.to : item.from
  const counterpartyLabel = outgoing ? item.toLabel : item.fromLabel

  return (
    <tr>
      <td>
        <span className={`dir ${outgoing ? 'out' : 'in'}`}>
          {outgoing ? 'Out' : 'In'}
        </span>
      </td>
      <td>
        <Link to={`/${networkId}/address/${counterparty}`}>{counterpartyLabel}</Link>
        <div className="mono muted small">{truncateAddress(counterparty)}</div>
        <div className="muted small">Token transfer</div>
      </td>
      <td>
        {item.amountFormatted} {item.token.symbol}
      </td>
      <td>{formatTimestamp(item.timestamp)}</td>
      <td>
        <a
          href={explorerTxUrl(networkId, item.txHash)}
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

function NativeRow({
  item,
  self,
  networkId,
}: {
  item: NativeTxEvent
  self: string
  networkId: NetworkId
}) {
  const outgoing = item.from.toLowerCase() === self.toLowerCase()
  const counterparty = outgoing ? item.to : item.from
  const counterpartyLabel = outgoing ? item.toLabel : item.fromLabel

  return (
    <tr className={item.failed ? 'row-failed' : undefined}>
      <td>
        <span className={`dir ${outgoing ? 'out' : 'in'}`}>
          {outgoing ? 'Out' : 'In'}
        </span>
      </td>
      <td>
        <Link to={`/${networkId}/address/${counterparty}`}>{counterpartyLabel}</Link>
        <div className="mono muted small">{truncateAddress(counterparty)}</div>
        <div className="muted small">
          Native {item.symbol}
          {item.method ? ` · ${item.method}` : ''}
          {item.failed ? ' · failed' : ''}
        </div>
      </td>
      <td>
        {item.amountFormatted} {item.symbol}
      </td>
      <td>{formatTimestamp(item.timestamp)}</td>
      <td>
        <a
          href={explorerTxUrl(networkId, item.txHash)}
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

export function TransferTable({
  items,
  self,
  networkId,
}: {
  items: TimelineItem[]
  self: string
  networkId: NetworkId
}) {
  if (items.length === 0) {
    return <p className="muted">No recent transactions found.</p>
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Dir</th>
            <th>Counterparty</th>
            <th>Amount</th>
            <th>Time</th>
            <th>Tx</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            if (item.kind === 'transfer') {
              return (
                <TransferRow
                  key={`t-${item.txHash}-${item.from}-${item.to}-${item.token.address}-${item.blockNumber}`}
                  item={item}
                  self={self}
                  networkId={networkId}
                />
              )
            }
            if (item.kind === 'native') {
              return (
                <NativeRow
                  key={`n-${item.txHash}-${item.from}-${item.to}-${item.blockNumber}`}
                  item={item}
                  self={self}
                  networkId={networkId}
                />
              )
            }
            return (
              <tr key={`e-${item.txHash}-${item.eventName}-${item.paymentId}`}>
                <td>
                  <span className="dir escrow">Escrow</span>
                </td>
                <td>
                  <strong>{item.eventName}</strong>
                  {item.detail ? (
                    <div className="muted small">{item.detail}</div>
                  ) : null}
                  {item.relatedLabel ? (
                    <div className="small">{item.relatedLabel}</div>
                  ) : null}
                </td>
                <td>
                  {item.amountFormatted
                    ? `${item.amountFormatted}${item.token ? ` ${item.token.symbol}` : ''}`
                    : '—'}
                </td>
                <td>{formatTimestamp(item.timestamp)}</td>
                <td>
                  <a
                    href={explorerTxUrl(networkId, item.txHash)}
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
  )
}
