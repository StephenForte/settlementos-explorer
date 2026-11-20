import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { toFunctionSelector } from 'viem'
import type {
  NativeTxEvent,
  TimelineItem,
  TransferEvent,
} from '../chain/transfers'
import { erc20Abi, paymentSettlementEventsAbi } from '../config/abis'
import { type NetworkId } from '../config/networks'
import { truncateAddress } from '../config/address-book'
import { formatTimestamp } from '../lib/format'
import { TxLink } from './TxLink'
import { TermTooltip } from './ui/TermTooltip'

const selectorNames = new Map<string, string>()

function indexSelectors(abi: readonly object[]) {
  for (const item of abi) {
    const entry = item as { type?: string; name?: string; inputs?: readonly { type: string }[] }
    if (entry.type !== 'function' || !entry.name || !entry.inputs) continue
    const signature = `function ${entry.name}(${entry.inputs.map((input) => input.type).join(',')})`
    selectorNames.set(toFunctionSelector(signature).toLowerCase(), entry.name)
  }
}

indexSelectors(erc20Abi)
indexSelectors(paymentSettlementEventsAbi)

function sameAddress(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase()
}

function partyOf(
  from: string,
  to: string,
  fromLabel: string,
  toLabel: string,
  self: string,
  markSelf: boolean,
) {
  const outgoing = sameAddress(from, self)
  const selfSend = markSelf && outgoing && sameAddress(to, self) && sameAddress(from, to)
  if (selfSend) {
    return {
      dir: 'self' as const,
      word: 'Self',
      counterparty: to,
      label: 'itself',
      link: false,
    }
  }
  return {
    dir: outgoing ? 'out' as const : 'in' as const,
    word: outgoing ? 'Out' : 'In',
    counterparty: outgoing ? to : from,
    label: outgoing ? toLabel : fromLabel,
    link: true,
  }
}

function MethodDetail({ method, decode }: { method?: string; decode: boolean }) {
  if (!method) return null
  if (!decode) return <> · {method}</>
  const selector = method.slice(0, 10).toLowerCase()
  const name = selectorNames.get(selector)
  if (name) return <> · {name}</>
  return (
    <>
      {' · '}
      <TermTooltip term="Contract call" definition={selector} />
    </>
  )
}

function CounterpartyName({
  networkId,
  address,
  label,
  link,
}: {
  networkId: NetworkId
  address: string
  label: string
  link: boolean
}) {
  if (!link) return <span>{label}</span>
  return <Link to={`/${networkId}/address/${address}`}>{label}</Link>
}

function TransferRow({
  item,
  self,
  networkId,
  markSelf,
  variant,
}: {
  item: TransferEvent
  self: string
  networkId: NetworkId
  markSelf: boolean
  variant: 'table' | 'list'
}) {
  const party = partyOf(item.from, item.to, item.fromLabel, item.toLabel, self, markSelf)
  const amount = `${item.amountFormatted} ${item.token.symbol}`
  const who = (
    <>
      <CounterpartyName
        networkId={networkId}
        address={party.counterparty}
        label={party.label}
        link={party.link}
      />
      <div className="mono muted small">{truncateAddress(party.counterparty)}</div>
      <div className="muted small">Token transfer</div>
    </>
  )
  if (variant === 'list') {
    return (
      <li className="activity-row">
        <div className="activity-top">
          <span className={`dir ${party.dir}`}>{party.word}</span>
          <p className="activity-amount">{amount}</p>
        </div>
        <div className="activity-party">{who}</div>
        <div className="activity-meta muted small">
          {formatTimestamp(item.timestamp)}
          {' · '}
          <TxLink networkId={networkId} hash={item.txHash} className="mono">
            {truncateAddress(item.txHash, 6)}
          </TxLink>
        </div>
      </li>
    )
  }
  return (
    <tr>
      <td>
        <span className={`dir ${party.dir}`}>{party.word}</span>
      </td>
      <td>{who}</td>
      <td>{amount}</td>
      <td>{formatTimestamp(item.timestamp)}</td>
      <td>
        <TxLink networkId={networkId} hash={item.txHash} className="mono">
          {truncateAddress(item.txHash, 6)}
        </TxLink>
      </td>
    </tr>
  )
}

function NativeRow({
  item,
  self,
  networkId,
  markSelf,
  decodeMethods,
  variant,
}: {
  item: NativeTxEvent
  self: string
  networkId: NetworkId
  markSelf: boolean
  decodeMethods: boolean
  variant: 'table' | 'list'
}) {
  const party = partyOf(item.from, item.to, item.fromLabel, item.toLabel, self, markSelf)
  const amount = `${item.amountFormatted} ${item.symbol}`
  const detail = (
    <div className="muted small">
      Native {item.symbol}
      <MethodDetail method={item.method} decode={decodeMethods} />
      {item.failed ? ' · failed' : ''}
    </div>
  )
  const who = (
    <>
      <CounterpartyName
        networkId={networkId}
        address={party.counterparty}
        label={party.label}
        link={party.link}
      />
      <div className="mono muted small">{truncateAddress(party.counterparty)}</div>
      {detail}
    </>
  )
  if (variant === 'list') {
    return (
      <li className={item.failed ? 'activity-row row-failed' : 'activity-row'}>
        <div className="activity-top">
          <span className={`dir ${party.dir}`}>{party.word}</span>
          <p className="activity-amount">{amount}</p>
        </div>
        <div className="activity-party">{who}</div>
        <div className="activity-meta muted small">
          {formatTimestamp(item.timestamp)}
          {' · '}
          <TxLink networkId={networkId} hash={item.txHash} className="mono">
            {truncateAddress(item.txHash, 6)}
          </TxLink>
        </div>
      </li>
    )
  }
  return (
    <tr className={item.failed ? 'row-failed' : undefined}>
      <td>
        <span className={`dir ${party.dir}`}>{party.word}</span>
      </td>
      <td>{who}</td>
      <td>{amount}</td>
      <td>{formatTimestamp(item.timestamp)}</td>
      <td>
        <TxLink networkId={networkId} hash={item.txHash} className="mono">
          {truncateAddress(item.txHash, 6)}
        </TxLink>
      </td>
    </tr>
  )
}

function EscrowRow({
  item,
  networkId,
  variant,
}: {
  item: Extract<TimelineItem, { kind: 'escrow' }>
  networkId: NetworkId
  variant: 'table' | 'list'
}) {
  const amount = item.amountFormatted
    ? `${item.amountFormatted}${item.token ? ` ${item.token.symbol}` : ''}`
    : '—'
  const who = (
    <>
      <strong>{item.eventName}</strong>
      {item.detail ? <div className="muted small">{item.detail}</div> : null}
      {item.relatedLabel ? <div className="small">{item.relatedLabel}</div> : null}
    </>
  )
  const tx = (
    <TxLink networkId={networkId} hash={item.txHash} className="mono">
      {truncateAddress(item.txHash, 6)}
    </TxLink>
  )
  if (variant === 'list') {
    return (
      <li className="activity-row">
        <div className="activity-top">
          <span className="dir escrow">Escrow</span>
          <p className="activity-amount">{amount}</p>
        </div>
        <div className="activity-party">{who}</div>
        <div className="activity-meta muted small">
          {formatTimestamp(item.timestamp)}
          {' · '}
          {tx}
        </div>
      </li>
    )
  }
  return (
    <tr>
      <td>
        <span className="dir escrow">Escrow</span>
      </td>
      <td>{who}</td>
      <td>{amount}</td>
      <td>{formatTimestamp(item.timestamp)}</td>
      <td>{tx}</td>
    </tr>
  )
}

function renderItem(
  item: TimelineItem,
  self: string,
  networkId: NetworkId,
  markSelf: boolean,
  decodeMethods: boolean,
  variant: 'table' | 'list',
): ReactNode {
  if (item.kind === 'transfer') {
    return (
      <TransferRow
        key={`t-${item.txHash}-${item.from}-${item.to}-${item.token.address}-${item.blockNumber}`}
        item={item}
        self={self}
        networkId={networkId}
        markSelf={markSelf}
        variant={variant}
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
        markSelf={markSelf}
        decodeMethods={decodeMethods}
        variant={variant}
      />
    )
  }
  return (
    <EscrowRow
      key={`e-${item.txHash}-${item.eventName}-${item.paymentId}`}
      item={item}
      networkId={networkId}
      variant={variant}
    />
  )
}

export function TransferTable({
  items,
  self,
  networkId,
  presentation = 'table',
  markSelf = false,
  decodeMethods = false,
}: {
  items: TimelineItem[]
  self: string
  networkId: NetworkId
  /** Stacked list used by the address receipt. Callers that omit this keep the table. */
  presentation?: 'table' | 'list'
  /** Address page: from == to == this address reads as Self / itself. Default keeps Out. */
  markSelf?: boolean
  /** Address page: ABI names, or "Contract call" with the selector in a tooltip. */
  decodeMethods?: boolean
}) {
  if (items.length === 0) {
    return <p className="muted">No recent transactions found.</p>
  }

  const rows = items.map((item) =>
    renderItem(item, self, networkId, markSelf, decodeMethods, presentation),
  )

  if (presentation === 'list') {
    return <ul className="activity-list">{rows}</ul>
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
        <tbody>{rows}</tbody>
      </table>
    </div>
  )
}
