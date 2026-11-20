import type { AddressBalances } from '../chain/balances'
import type { NetworkId } from '../config/networks'
import { getRpcOverride } from '../lib/rpc-overrides'
import { RpcOverrideForm } from './RpcOverrideForm'
import { AmountDisplay } from './ui/AmountDisplay'

function hasUnavailable(balances: AddressBalances): boolean {
  if (balances.native.status === 'unavailable') return true
  return balances.tokens.some((t) => t.status === 'unavailable')
}

export function BalanceChips({
  balances,
  networkId,
  onRpcOverrideChange,
  layout = 'chips',
}: {
  balances: AddressBalances | null | undefined
  /** When set, unavailable chips (or an existing override) offer an RPC form. */
  networkId?: NetworkId
  onRpcOverrideChange?: () => void
  /** Address receipt uses large figures. Callers that omit this keep the chips. */
  layout?: 'chips' | 'figures'
}) {
  if (!balances) {
    return (
      <div className="balance-chips" aria-busy="true" aria-label="Loading balances">
        <span className="chip chip-skeleton" />
        <span className="chip chip-skeleton" />
        <span className="chip chip-skeleton" />
      </div>
    )
  }

  const figures = layout === 'figures'

  return (
    <div className={figures ? 'balance-chips-block balance-figures' : 'balance-chips-block'}>
      {figures ? (
        <div className="amount-pair">
          <AmountDisplay
            label="Native"
            amount={
              balances.native.status === 'unavailable'
                ? 'Unavailable'
                : (balances.native.formatted ?? 'Unavailable')
            }
            unit={balances.native.symbol}
            sub={balances.native.error}
          />
          {balances.tokens.map((t) => (
            <AmountDisplay
              key={t.token.address}
              label={t.token.symbol}
              amount={t.status === 'unavailable' ? 'Unavailable' : (t.formatted ?? 'Unavailable')}
              unit={t.token.symbol}
              sub={t.error}
            />
          ))}
        </div>
      ) : (
        <div className="balance-chips">
          <span
            className={`chip ${balances.native.status === 'unavailable' ? 'chip-warn' : ''}`}
            title={balances.native.error}
          >
            {balances.native.status === 'unavailable'
              ? `${balances.native.symbol}: unavailable`
              : `${balances.native.formatted} ${balances.native.symbol}`}
          </span>
          {balances.tokens.map((t) => (
            <span
              key={t.token.address}
              className={`chip ${t.status === 'unavailable' ? 'chip-warn' : ''}`}
              title={t.error}
            >
              {t.status === 'unavailable'
                ? `${t.token.symbol}: unavailable`
                : `${t.formatted} ${t.token.symbol}`}
            </span>
          ))}
        </div>
      )}
      {networkId ? (
        <RpcOverrideForm
          networkId={networkId}
          defaultOpen={
            hasUnavailable(balances) || Boolean(getRpcOverride(networkId))
          }
          onChanged={onRpcOverrideChange}
        />
      ) : null}
    </div>
  )
}
